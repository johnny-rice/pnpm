import {
  LOCKFILE_VERSION,
  WANTED_LOCKFILE,
} from '@pnpm/constants'
import {
  createLockfileObject,
  existsNonEmptyWantedLockfile,
  isEmptyLockfile,
  type LockfileObject,
  readCurrentLockfile,
  readWantedLockfile,
  readWantedLockfileAndAutofixConflicts,
} from '@pnpm/lockfile.fs'
import { logger } from '@pnpm/logger'
import { type ProjectId, type ProjectRootDir } from '@pnpm/types'
import clone from 'ramda/src/clone'
import equals from 'ramda/src/equals'

export interface PnpmContext {
  currentLockfile: LockfileObject
  existsCurrentLockfile: boolean
  existsWantedLockfile: boolean
  existsNonEmptyWantedLockfile: boolean
  wantedLockfile: LockfileObject
}

export async function readLockfiles (
  opts: {
    autoInstallPeers: boolean
    excludeLinksFromLockfile: boolean
    peersSuffixMaxLength: number
    ci?: boolean
    force: boolean
    frozenLockfile: boolean
    projects: Array<{
      id: ProjectId
      rootDir: ProjectRootDir
    }>
    lockfileDir: string
    registry: string
    useLockfile: boolean
    useGitBranchLockfile?: boolean
    mergeGitBranchLockfiles?: boolean
    internalPnpmDir: string
  }
): Promise<{
    currentLockfile: LockfileObject
    currentLockfileIsUpToDate: boolean
    existsCurrentLockfile: boolean
    existsWantedLockfile: boolean
    existsNonEmptyWantedLockfile: boolean
    wantedLockfile: LockfileObject
    wantedLockfileIsModified: boolean
    lockfileHadConflicts: boolean
  }> {
  const wantedLockfileVersion = LOCKFILE_VERSION
  // ignore `pnpm-lock.yaml` on CI servers
  // a latest pnpm should not break all the builds
  const lockfileOpts = {
    ignoreIncompatible: opts.force || opts.ci === true,
    wantedVersions: [LOCKFILE_VERSION],
    useGitBranchLockfile: opts.useGitBranchLockfile,
    mergeGitBranchLockfiles: opts.mergeGitBranchLockfiles,
  }
  const fileReads = [] as Array<Promise<LockfileObject | undefined | null>>
  let lockfileHadConflicts: boolean = false
  if (opts.useLockfile) {
    if (!opts.frozenLockfile) {
      fileReads.push(
        (async () => {
          try {
            const { lockfile, hadConflicts } = await readWantedLockfileAndAutofixConflicts(opts.lockfileDir, lockfileOpts)
            lockfileHadConflicts = hadConflicts
            return lockfile
          } catch (err: any) { // eslint-disable-line
            logger.warn({
              message: `Ignoring broken lockfile at ${opts.lockfileDir}: ${err.message as string}`,
              prefix: opts.lockfileDir,
            })
            return undefined
          }
        })()
      )
    } else {
      fileReads.push(readWantedLockfile(opts.lockfileDir, lockfileOpts))
    }
  } else {
    if (await existsNonEmptyWantedLockfile(opts.lockfileDir, lockfileOpts)) {
      logger.warn({
        message: `A ${WANTED_LOCKFILE} file exists. The current configuration prohibits to read or write a lockfile`,
        prefix: opts.lockfileDir,
      })
    }
    fileReads.push(Promise.resolve(undefined))
  }
  fileReads.push(
    (async () => {
      try {
        return await readCurrentLockfile(opts.internalPnpmDir, lockfileOpts)
      } catch (err: any) { // eslint-disable-line
        logger.warn({
          message: `Ignoring broken lockfile at ${opts.internalPnpmDir}: ${err.message as string}`,
          prefix: opts.lockfileDir,
        })
        return undefined
      }
    })()
  )
  const files = await Promise.all<LockfileObject | null | undefined>(fileReads)
  const sopts = {
    autoInstallPeers: opts.autoInstallPeers,
    excludeLinksFromLockfile: opts.excludeLinksFromLockfile,
    lockfileVersion: wantedLockfileVersion,
    peersSuffixMaxLength: opts.peersSuffixMaxLength,
  }
  const importerIds = opts.projects.map((importer) => importer.id)
  const currentLockfile = files[1] ?? createLockfileObject(importerIds, sopts)
  for (const importerId of importerIds) {
    if (!currentLockfile.importers[importerId]) {
      currentLockfile.importers[importerId] = {
        specifiers: {},
      }
    }
  }
  const wantedLockfile = files[0] ??
    (currentLockfile && clone(currentLockfile)) ??
    createLockfileObject(importerIds, sopts)
  let wantedLockfileIsModified = false
  for (const importerId of importerIds) {
    if (!wantedLockfile.importers[importerId]) {
      wantedLockfileIsModified = true
      wantedLockfile.importers[importerId] = {
        specifiers: {},
      }
    }
  }
  const existsWantedLockfile = files[0] != null
  return {
    currentLockfile,
    currentLockfileIsUpToDate: equals(currentLockfile, wantedLockfile),
    existsCurrentLockfile: files[1] != null,
    existsWantedLockfile,
    existsNonEmptyWantedLockfile: existsWantedLockfile && !isEmptyLockfile(wantedLockfile),
    wantedLockfile,
    wantedLockfileIsModified,
    lockfileHadConflicts,
  }
}

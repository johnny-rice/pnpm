import { nameVerFromPkgSnapshot, type PackageSnapshots } from '@pnpm/lockfile.utils'
import { getAllDependenciesFromManifest } from '@pnpm/manifest-utils'
import { DIRECT_DEP_SELECTOR_WEIGHT, type PreferredVersions } from '@pnpm/resolver-base'
import { type DependencyManifest, type ProjectManifest } from '@pnpm/types'
import getVersionSelectorType from 'version-selector-type'

export function getPreferredVersionsFromLockfileAndManifests (
  snapshots: PackageSnapshots | undefined,
  manifests: Array<DependencyManifest | ProjectManifest>
): PreferredVersions {
  const preferredVersions: PreferredVersions = {}
  for (const manifest of manifests) {
    const specs = getAllDependenciesFromManifest(manifest)
    for (const [name, spec] of Object.entries(specs)) {
      const selector = getVersionSelectorType(spec)
      if (!selector) continue
      preferredVersions[name] = preferredVersions[name] ?? {}
      preferredVersions[name][spec] = {
        selectorType: selector.type,
        weight: DIRECT_DEP_SELECTOR_WEIGHT,
      }
    }
  }
  if (!snapshots) return preferredVersions
  addPreferredVersionsFromLockfile(snapshots, preferredVersions)
  return preferredVersions
}

function addPreferredVersionsFromLockfile (snapshots: PackageSnapshots, preferredVersions: PreferredVersions): void {
  for (const [depPath, snapshot] of Object.entries(snapshots)) {
    const { name, version } = nameVerFromPkgSnapshot(depPath, snapshot)
    if (!preferredVersions[name]) {
      preferredVersions[name] = { [version]: 'version' }
    } else if (!preferredVersions[name][version]) {
      preferredVersions[name][version] = 'version'
    }
  }
}

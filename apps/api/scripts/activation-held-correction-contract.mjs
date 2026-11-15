import { heldCanonical, heldRecord } from './activation-held-contract.mjs';

// One explicitly approved correction of a known held runtime failure, never a retry policy.
export const heldCorrection = Object.freeze({
  selector: 'held-config-correction-01',
  contextDigest: 'bb9d386b5bbc2bfa4e626c3e5433175d9262671a5892758ca59857c56fa45f02',
  sourceRevision: '2a08578d7ce1867ec63612b4402d21fa51619e5f',
  sourceTree: '85d5f291964f33c44a70124cadd198b8bce2d9ef',
  inventoryDigest: '205e42764af0704b6029d0223d982249cc9f0615e63ae633a9451c79cd2bde10',
  previousExecutableDigest: 'ebc43ab9e5b510c2bdbdba234dfaa4d86de9857b685677bd9992310a0c8e054c',
  failedProbeRun: '43683728143',
  failedProbeDigest: 'b257a4dbf216e95865e339dba441944ec3ee2ef3da71542a13748d29598d5b25',
  failedBindingDigest: 'bde10cebb41ec5c19dc9f33a04a5d280c959bddac0914967b18d39289868d125',
  ownerReset: Object.freeze({ APP_FOUNDATION_ENABLED: 'true', APP_SCHEMA_MODE: 'strict',
    APP_ACTIVATION_CONFIG_DIGEST: '249e18e93eb01e5fa1f66117c82a8cca2e0777938655308cc43af437095e7892' }),
  originalReceipts: Object.freeze({
    'create-started': '068c33cbefd91af29fcb9685fe8ab868381559489945399c246a9c4e814caaa2',
    'create-ack': '96e6c981fca2277e71cae90897f28c5e0fc8f2e2c33f47edb5b56e3a2b5a815e',
    'create-result': 'c43b98c50de7c9f7526f12fd83871a8eb43bb41fa5716a63a61667e3c62d2dce',
    'attest-started': '21d75bc776469adc8573d7f2c30e053aefb4dceeeb0e901a07bd4bdf4360db26',
    'attest-result': 'd0bd09f9bb52a8ea5eae74a6e430addd1a7a308b96d82eec6a3cc17fea46f04b',
    pending: 'aa0df8efc9398fe9ed35a9ca9832414ce2e7ded2e4c68e988bad23a54c5a11d3',
  }),
  sourceDigests: Object.freeze({
    '.github/workflows/be-candidate-probe.yml': '44a4136dbeb17d40ea77992069ddd6a919452b979ebc8a82ef7b800d3cec2e0d',
    'apps/api/scripts/activation-candidate-probe.mjs': 'b22406a9cd465526e4ec420538681193118d12da51103b89460f41a5d768ab69',
    'apps/api/scripts/activation-held-contract.mjs': 'd64ae10f0c88132572159c4bb883a096c7b32c07c727029159adf6e6b52a015c',
  }),
});

/** @typedef {{revision: string, tree: string}} ControllerPublication */
/** @typedef {{selector: string, contextDigest: string, controllerPublication: ControllerPublication, sourceDigests: Record<string,string>}} HeldCorrectionCapability */
/** @returns {HeldCorrectionCapability} */
export function validateHeldCorrectionCapability(value) {
  const capability = heldRecord(value, ['selector', 'contextDigest', 'controllerPublication', 'sourceDigests']);
  const publication = heldRecord(capability.controllerPublication, ['revision', 'tree']);
  if (capability.selector !== heldCorrection.selector || capability.contextDigest !== heldCorrection.contextDigest
    || !/^[a-f0-9]{40}$/.test(publication.revision ?? '') || !/^[a-f0-9]{40}$/.test(publication.tree ?? '')
    || [heldCorrection.sourceRevision, 'c0e6d435b7d4bb4c65b50a540097a317f080bcac', 'f162c8db8ec149724c0a25537a4a0674bd012035'].includes(publication.revision)
    || heldCanonical(capability.sourceDigests) !== heldCanonical(heldCorrection.sourceDigests)) {
    throw new Error('Fixed held correction publication capability refused.');
  }
  return capability;
}

// A source-local manifest deliberately uses null, which the runtime validator rejects.
export function heldCorrectionCapability(controllerPublication) {
  return { selector: heldCorrection.selector, contextDigest: heldCorrection.contextDigest,
    controllerPublication, sourceDigests: { ...heldCorrection.sourceDigests } };
}

import { createHash } from 'node:crypto';

export const heldAppPolicy = Object.freeze({
  executionId: '675b465c-f3cc-48e0-8994-7a3312970e53',
  unknownHead: '75333c2fa9074f418c23f4d67ea5a68db4ecf659718983ebfb13d2c46b096267',
  packetDigest: '5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690',
  artifactDigest: '82419e360517389f1e20c23d43f0e5948518ad659f0f8a87b9f41abcb8d302d2',
  revision: 'f162c8db8ec149724c0a25537a4a0674bd012035', tree: '181b2c014f9373e4d6cdf055cba01eac11ed5a5e',
  sourceDigest: '73e8f1f5cb7683da2f337b6f3092d6cdcd6dd42ea15a224ce35aa3ea0b77c3e8',
  project: 'prj_uITHKLUGGE98VxrEcs5FoktBbcls', scope: 'team_k2Hk4wx5XAb9Mgc6lP5AjVhf',
});
/** @typedef {{ [Key in keyof typeof heldAppPolicy]: string }} HeldAppPolicy */
export const heldBindingVariable = 'BE_D1_HELD_APP_BINDING';
export const heldTargetKeys = Object.freeze([...Object.keys(heldAppPolicy), 'candidate', 'origin', 'configDigest',
  'createClaimDigest', 'createAckDigest', 'heldReceiptDigest'].sort());
export const heldProbeSources = Object.freeze(['.github/workflows/be-candidate-probe.yml',
  'apps/api/scripts/activation-candidate-probe.mjs', 'apps/api/scripts/activation-held-contract.mjs']);
export const heldPinPath = 'apps/api/config/held-app-probe-binding.json';
export function heldCanonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(heldCanonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${heldCanonical(value[key])}`).join(',')}}`;
}
export const heldHash = value => createHash('sha256').update(heldCanonical(value)).digest('hex');
function refuse() { throw new Error('Held application binding refused.'); }
export function heldRecord(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) refuse();
  return value;
}
/** @param {HeldAppPolicy} [policy] */
export function validateHeldTarget(value, policy = heldAppPolicy) {
  const target = heldRecord(value, heldTargetKeys);
  if (Object.entries(policy).some(([key, expected]) => target[key] !== expected)
    || !/^dpl_[A-Za-z0-9]{1,124}$/.test(target.candidate ?? '')
    || target.candidate === 'dpl_525LvEPCBud7nyAeFTcRx8iipTrk'
    || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(target.origin ?? '')
    || ['configDigest', 'createClaimDigest', 'createAckDigest', 'heldReceiptDigest'].some(key => !/^[a-f0-9]{64}$/.test(target[key] ?? ''))) refuse();
  return target;
}
// The containing commit is deliberately outside the data pin: embedding its own SHA would be circular.
/** @param {HeldAppPolicy} [policy] */
export function validateHeldBinding(value, sourcePin, policy = heldAppPolicy) {
  const binding = heldRecord(value, [...heldTargetKeys, 'workflowRevision']);
  const pin = heldRecord(sourcePin, ['version', 'enabled', 'target']);
  if (pin.version !== 1 || pin.enabled !== true || !/^[a-f0-9]{40}$/.test(binding.workflowRevision ?? '')) refuse();
  const target = Object.fromEntries(heldTargetKeys.map(key => [key, binding[key]]));
  validateHeldTarget(target, policy); validateHeldTarget(pin.target, policy);
  if (heldCanonical(target) !== heldCanonical(pin.target)) refuse();
  return binding;
}

// D2 consumes the actual D1 event, never a caller-selected held deployment or old probe source pins.
export const heldD2 = Object.freeze({
  selector: 'held-app-acceptance',
  head: 'e8a2ac613eb436af13c1ef14992b22fcb6d30fff7434929ba0cead7dadf03078',
  proofDigest: 'c1c0edf5d97154eabb32fb394c8470775b546c372efcce79cfe4e4491f8c36ba',
  importClaimDigest: 'e67c65a59618ba754efbdb75dccdabc05ef8f7deb858fb93d16914d8e76c0117',
  importResultDigest: '632f3c5bfef40cf46575d95803e04344c775622524b31faee403c3ab3af43469',
  candidate: 'dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7',
  origin: 'https://esty-admin-dialgx31z-khuonghuyhieu0705s-projects.vercel.app',
  configDigest: '249e18e93eb01e5fa1f66117c82a8cca2e0777938655308cc43af437095e7892',
  createClaimDigest: '7ef8fb53f3faefa088d3499694b458eb4556064fbf7c2e77d023cf656f85a6e0',
  createAckDigest: '43fdfd2b59a02081ffab894379b781a964564f398ed955da95b488b2377b9362',
  heldReceiptDigest: 'ad8570403fcc26bed885c4f3363eea8550f21f05035119cb049ef1be84f77058',
  contextDigest: 'bb9d386b5bbc2bfa4e626c3e5433175d9262671a5892758ca59857c56fa45f02',
  gateVariable: 'BE_D2_APP_ACCEPTANCE_GATE',
});
export const heldD2Sources = Object.freeze([...heldProbeSources, 'apps/api/scripts/hosted-acceptance.ts']);
export function validateHeldD2Capability(value) {
  const capability = heldRecord(value, ['selector', 'contextDigest', 'controllerPublication', 'sourceDigests']);
  const publication = heldRecord(capability.controllerPublication, ['revision', 'tree']);
  if (capability.selector !== heldD2.selector || capability.contextDigest !== heldD2.contextDigest
    || !/^[a-f0-9]{40}$/.test(publication.revision ?? '') || !/^[a-f0-9]{40}$/.test(publication.tree ?? '')
    || [heldAppPolicy.revision, '927be7af6c46722615fe8f9f356fffb1e7424dd7'].includes(publication.revision)
    || Object.keys(heldRecord(capability.sourceDigests, heldD2Sources)).some(key =>
      !/^[a-f0-9]{64}$/.test(capability.sourceDigests[key] ?? ''))) refuse();
  return capability;
}
export function validateHeldD2Gate(value, stage, revision) {
  const gate = heldRecord(value, ['version', 'stage', 'head', 'claimDigest', 'controllerRevision']);
  if (!['candidate', 'final'].includes(stage) || gate.version !== 1 || gate.stage !== stage
    || gate.controllerRevision !== revision || !/^[a-f0-9]{40}$/.test(revision ?? '')
    || !/^[a-f0-9]{64}$/.test(gate.claimDigest ?? '') || !/^[a-f0-9]{64}$/.test(gate.head ?? '')
    || (stage === 'candidate' && gate.head !== heldD2.head) || (stage === 'final' && gate.head === heldD2.head)) refuse();
  return gate;
}
export function validateHeldD2Target(target, policy = heldAppPolicy, expected = heldD2) {
  validateHeldTarget(target, policy);
  for (const key of ['candidate', 'origin', 'configDigest', 'createClaimDigest', 'createAckDigest', 'heldReceiptDigest'])
    if (target[key] !== expected[key]) refuse();
  return target;
}

// Public historical preimages, not an approval or a completed frontend activation.
export const historicalReleaseEvidence = {
  "version": 1,
  "accepted": {
    "id": 7703208254,
    "run": "42970824679",
    "activationRun": "dcbc0b5f-1707-485d-adb5-02b45037319a",
    "status": {
      "id": 22303718377,
      "state": "in_progress",
      "created_at": "2026-11-16T10:23:54Z",
      "description": "activation:app:outcome:aa1dc0e90fd3921e3b14d303991cfdcdbb73efad0c481ce0d0eff0f4931af7f9"
    }
  },
  "failed": {
    "id": 7686732071,
    "status": {
      "id": 21921899888,
      "state": "error",
      "created_at": "2026-11-11T06:00:12Z",
      "description": "failed_preflight_no_effects:829cbf0bb11517fb0607b18902488133be08deb635589581b42db192f66120fa"
    },
    "proof": {
      "version": 1,
      "kind": "failed-preflight-no-effects",
      "repository": "khuonghuyhieu/esty-admin",
      "environment": "be-production",
      "project": "prj_uITHKLUGGE98VxrEcs5FoktBbcls",
      "workflowRun": "42847325668",
      "workflowRevision": "776cb034f035ce94388f83be8bc52b199ce7fd34",
      "activationRun": "36a0c3c3-0a74-4ccf-b6a3-8d5da26e4eed",
      "packetDigest": "8385563025717633d77f7a2a38e3fc26f5b7e51ab9fb2b81086eee3edde15382",
      "journal": 7686732071,
      "job": 129938488019,
      "artifact": "82419e360517389f1e20c23d43f0e5948518ad659f0f8a87b9f41abcb8d302d2",
      "receiptArtifact": 13777634542,
      "receiptZipDigest": "ead036b6dabb78d411eb24ef11eb3970fb8295387bfa797c0753c4c6138b656d",
      "receiptArchiveDigest": "01b21b3852cb69ade2e6e89c9c77067fe05302d531493c7f1a754cdd1b498ccf",
      "receiptInventoryDigest": "d174556ea27891f0391dc5fc0ba1d6efed2730f0a72a669f5fd7b8248ccbc8a3"
    }
  },
  "finalAccepted": {
    "binding": {
      "version": 1,
      "executionId": "675b465c-f3cc-48e0-8994-7a3312970e53",
      "basisHead": "e8a2ac613eb436af13c1ef14992b22fcb6d30fff7434929ba0cead7dadf03078",
      "candidate": "dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7",
      "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
      "artifactDigest": "82419e360517389f1e20c23d43f0e5948518ad659f0f8a87b9f41abcb8d302d2",
      "executableDigest": "9f0fa95bc3691d2477df1786f008edc68ac6249cd5dcb8cea6ff6e59c64f0751",
      "capability": {
        "selector": "held-app-acceptance",
        "contextDigest": "bb9d386b5bbc2bfa4e626c3e5433175d9262671a5892758ca59857c56fa45f02",
        "controllerPublication": {
          "revision": "a9b3d70ceff042b893fa06877eca197d3d31c06c",
          "tree": "a2b67dab53d6ab3f68d9849febe12bc298bd8b89"
        },
        "sourceDigests": {
          ".github/workflows/be-candidate-probe.yml": "3da9c1cd29c4d40c0774c7f3e9909337f8be062afb8b85ce3fbae9d02c0c6caa",
          "apps/api/scripts/activation-candidate-probe.mjs": "e6777d08e5d5c84dc4b15bc857051ac8c904127b850b19eca56a16613fd5238d",
          "apps/api/scripts/activation-held-contract.mjs": "abb42cf3501608f644eeee672d91b20b1dc3545310730d2ddb8570b3fd5d1681",
          "apps/api/scripts/hosted-acceptance.ts": "a531962762af89fa936648d33201da09f52bc7c31d59e613bf4cc52d7e3bfe80"
        }
      }
    },
    "proof": {
      "version": 1,
      "binding": {
        "artifactDigest": "82419e360517389f1e20c23d43f0e5948518ad659f0f8a87b9f41abcb8d302d2",
        "candidate": "dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7",
        "configDigest": "249e18e93eb01e5fa1f66117c82a8cca2e0777938655308cc43af437095e7892",
        "createAckDigest": "43fdfd2b59a02081ffab894379b781a964564f398ed955da95b488b2377b9362",
        "createClaimDigest": "7ef8fb53f3faefa088d3499694b458eb4556064fbf7c2e77d023cf656f85a6e0",
        "executionId": "675b465c-f3cc-48e0-8994-7a3312970e53",
        "heldReceiptDigest": "ad8570403fcc26bed885c4f3363eea8550f21f05035119cb049ef1be84f77058",
        "origin": "https://esty-admin-dialgx31z-khuonghuyhieu0705s-projects.vercel.app",
        "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
        "project": "prj_uITHKLUGGE98VxrEcs5FoktBbcls",
        "revision": "f162c8db8ec149724c0a25537a4a0674bd012035",
        "scope": "team_k2Hk4wx5XAb9Mgc6lP5AjVhf",
        "sourceDigest": "73e8f1f5cb7683da2f337b6f3092d6cdcd6dd42ea15a224ce35aa3ea0b77c3e8",
        "tree": "181b2c014f9373e4d6cdf055cba01eac11ed5a5e",
        "unknownHead": "75333c2fa9074f418c23f4d67ea5a68db4ecf659718983ebfb13d2c46b096267",
        "workflowRevision": "a9b3d70ceff042b893fa06877eca197d3d31c06c"
      },
      "bindingDigest": "ebfef6f76f1611eb1ec78d496574b5fdf4462aa4cbc13e22a3fe276259b2b337",
      "workflowRun": "43847640596",
      "artifactId": 14216865139,
      "archiveDigest": "89dc2f4cac25a9b61858c37a0e8203de05667bd581c3635d393a50cdba6705c6",
      "receiptDigest": "da45b3e0174df76f50cebd35d6dcd999b93834497210e89710ae08996662b388",
      "sourceDigests": {
        ".github/workflows/be-candidate-probe.yml": "3da9c1cd29c4d40c0774c7f3e9909337f8be062afb8b85ce3fbae9d02c0c6caa",
        "apps/api/scripts/activation-candidate-probe.mjs": "e6777d08e5d5c84dc4b15bc857051ac8c904127b850b19eca56a16613fd5238d",
        "apps/api/scripts/activation-held-contract.mjs": "abb42cf3501608f644eeee672d91b20b1dc3545310730d2ddb8570b3fd5d1681",
        "apps/api/scripts/hosted-acceptance.ts": "a531962762af89fa936648d33201da09f52bc7c31d59e613bf4cc52d7e3bfe80"
      },
      "sourcePinDigest": "9d1b22126d8f284df8a435a002025b181c60c06084a233fd77324448cdfafcc1",
      "kind": "github-held-app-acceptance",
      "gate": {
        "version": 1,
        "stage": "final",
        "head": "c6db3381fd74a6801826a87a6c4c1ce03858b882b1f62f0efb29ced86f055270",
        "claimDigest": "e6d9793707ef5564dd13d9f6a6ba2d9d33c2ed22d0ab87962e985ecd18aa41cf",
        "controllerRevision": "a9b3d70ceff042b893fa06877eca197d3d31c06c"
      },
      "checks": {
        "live": "passed",
        "computedRuntimeDigest": "passed",
        "target": "passed",
        "access": "passed",
        "cors": "passed",
        "authMembership": "not-proved"
      }
    }
  },
  "promotionAck": "{\n  \"binding\": {\n    \"version\": 1,\n    \"executionId\": \"675b465c-f3cc-48e0-8994-7a3312970e53\",\n    \"basisHead\": \"e8a2ac613eb436af13c1ef14992b22fcb6d30fff7434929ba0cead7dadf03078\",\n    \"candidate\": \"dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7\",\n    \"packetDigest\": \"5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690\",\n    \"artifactDigest\": \"82419e360517389f1e20c23d43f0e5948518ad659f0f8a87b9f41abcb8d302d2\",\n    \"executableDigest\": \"9f0fa95bc3691d2477df1786f008edc68ac6249cd5dcb8cea6ff6e59c64f0751\",\n    \"capability\": {\n      \"selector\": \"held-app-acceptance\",\n      \"contextDigest\": \"bb9d386b5bbc2bfa4e626c3e5433175d9262671a5892758ca59857c56fa45f02\",\n      \"controllerPublication\": {\n        \"revision\": \"a9b3d70ceff042b893fa06877eca197d3d31c06c\",\n        \"tree\": \"a2b67dab53d6ab3f68d9849febe12bc298bd8b89\"\n      },\n      \"sourceDigests\": {\n        \".github/workflows/be-candidate-probe.yml\": \"3da9c1cd29c4d40c0774c7f3e9909337f8be062afb8b85ce3fbae9d02c0c6caa\",\n        \"apps/api/scripts/activation-candidate-probe.mjs\": \"e6777d08e5d5c84dc4b15bc857051ac8c904127b850b19eca56a16613fd5238d\",\n        \"apps/api/scripts/activation-held-contract.mjs\": \"abb42cf3501608f644eeee672d91b20b1dc3545310730d2ddb8570b3fd5d1681\",\n        \"apps/api/scripts/hosted-acceptance.ts\": \"a531962762af89fa936648d33201da09f52bc7c31d59e613bf4cc52d7e3bfe80\"\n      }\n    }\n  },\n  \"intentHead\": \"c6db3381fd74a6801826a87a6c4c1ce03858b882b1f62f0efb29ced86f055270\",\n  \"code\": 0,\n  \"aborted\": false\n}\n",
  "appEvents": [
    {
      "version": 1,
      "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
      "previousHash": "e8a2ac613eb436af13c1ef14992b22fcb6d30fff7434929ba0cead7dadf03078",
      "sequence": 23,
      "phase": "app",
      "kind": "intent",
      "value": {
        "outcome": "unknown"
      },
      "sha256": "d1f8247e768900f816d91ed099a8adb243e806d3404d91ad2a4a704e99409956"
    },
    {
      "version": 1,
      "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
      "previousHash": "d1f8247e768900f816d91ed099a8adb243e806d3404d91ad2a4a704e99409956",
      "sequence": 24,
      "phase": "app",
      "kind": "authorized",
      "value": {
        "intentHash": "d1f8247e768900f816d91ed099a8adb243e806d3404d91ad2a4a704e99409956"
      },
      "sha256": "4cfd5e31517ed641887136d01c2903a1389627c93e9fa2bfae973ac3e593033c"
    },
    {
      "version": 1,
      "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
      "previousHash": "4cfd5e31517ed641887136d01c2903a1389627c93e9fa2bfae973ac3e593033c",
      "sequence": 25,
      "phase": "app",
      "kind": "started",
      "value": {
        "outcome": "unknown"
      },
      "sha256": "deed34089a6bad70cd0a6cfe3b8a3901180b1b68df17e884627c3805eb834b69"
    },
    {
      "version": 1,
      "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
      "previousHash": "deed34089a6bad70cd0a6cfe3b8a3901180b1b68df17e884627c3805eb834b69",
      "sequence": 26,
      "phase": "app",
      "kind": "acknowledged",
      "value": {
        "deploymentId": "dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7"
      },
      "sha256": "62354ff369208906646f883c46bddcea6940183c005b727d06232561a86bf455"
    },
    {
      "version": 1,
      "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
      "previousHash": "62354ff369208906646f883c46bddcea6940183c005b727d06232561a86bf455",
      "sequence": 27,
      "phase": "app",
      "kind": "candidate-attested",
      "value": {
        "deploymentId": "dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7",
        "configDigest": "249e18e93eb01e5fa1f66117c82a8cca2e0777938655308cc43af437095e7892"
      },
      "sha256": "0172f0a65c997ea4194c553b58f1a25f8a1ec04abfc77d06ef8fde64ed46a092"
    },
    {
      "version": 1,
      "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
      "previousHash": "0172f0a65c997ea4194c553b58f1a25f8a1ec04abfc77d06ef8fde64ed46a092",
      "sequence": 28,
      "phase": "app",
      "kind": "promotion-intent",
      "value": {
        "deploymentId": "dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7"
      },
      "sha256": "c6db3381fd74a6801826a87a6c4c1ce03858b882b1f62f0efb29ced86f055270"
    },
    {
      "version": 1,
      "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
      "previousHash": "c6db3381fd74a6801826a87a6c4c1ce03858b882b1f62f0efb29ced86f055270",
      "sequence": 29,
      "phase": "app",
      "kind": "outcome",
      "value": {
        "result": "confirmed",
        "databaseOutcome": "not_started",
        "count": 1,
        "deploymentId": "dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7",
        "reportDigest": "774ab515c7cedb222a6960620c73d859ac360faafdd0271c3a3b42519b55a56c"
      },
      "sha256": "aa1dc0e90fd3921e3b14d303991cfdcdbb73efad0c481ce0d0eff0f4931af7f9"
    },
    {
      "version": 1,
      "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
      "previousHash": "aa1dc0e90fd3921e3b14d303991cfdcdbb73efad0c481ce0d0eff0f4931af7f9",
      "sequence": 30,
      "phase": "app",
      "kind": "confirming",
      "value": {
        "outcomeHash": "aa1dc0e90fd3921e3b14d303991cfdcdbb73efad0c481ce0d0eff0f4931af7f9"
      },
      "sha256": "1c807a2804eb4775718aa5f4774e3dea90c5f78c67db368911d83c62ca1d7ec5"
    },
    {
      "version": 1,
      "packetDigest": "5b2567f007b8ba7870a858b22e0a48b28e3a1a7bb302b51e1e01f2d704dd6690",
      "previousHash": "1c807a2804eb4775718aa5f4774e3dea90c5f78c67db368911d83c62ca1d7ec5",
      "sequence": 31,
      "phase": "app",
      "kind": "remote-confirmed",
      "value": {
        "outcomeHash": "aa1dc0e90fd3921e3b14d303991cfdcdbb73efad0c481ce0d0eff0f4931af7f9"
      },
      "sha256": "1c95b6e8ea9872440fdffe52ac24e9ea91234bed2294e7857b816e18fddf536b"
    }
  ]
} as const;

import type { ValidationSeverity } from '../types.js';

export interface MetadataFieldSchema {
  required: boolean;
  type: 'string' | 'number' | 'string[]';
  allowedValues?: readonly string[] | readonly number[];
  severity?: ValidationSeverity;
}

export interface KindMetadataSchema {
  fields: Record<string, MetadataFieldSchema>;
}

export const KIND_METADATA_SCHEMAS: Record<string, KindMetadataSchema> = {
  TESTCASE: {
    fields: {
      testType: {
        required: true,
        type: 'string',
        allowedValues: ['unit', 'integration', 'e2e', 'manual', 'performance'],
      },
      verifies: {
        required: true,
        type: 'string[]',
      },
    },
  },
  DEFECT: {
    fields: {
      severity: {
        required: true,
        type: 'string',
        allowedValues: ['critical', 'high', 'medium', 'low'],
      },
      priority: {
        required: false,
        type: 'string',
        allowedValues: ['P0', 'P1', 'P2', 'P3', 'P4'],
      },
      affectedArtifacts: {
        required: false,
        type: 'string[]',
      },
    },
  },
  RISK: {
    fields: {
      probability: {
        required: true,
        type: 'number',
        allowedValues: [1, 2, 3, 4, 5],
      },
      impact: {
        required: true,
        type: 'number',
        allowedValues: [1, 2, 3, 4, 5],
      },
      mitigations: {
        required: false,
        type: 'string[]',
      },
    },
  },
  INTERFACE: {
    fields: {
      protocol: {
        required: false,
        type: 'string',
        allowedValues: ['REST', 'gRPC', 'GraphQL', 'event'],
      },
    },
  },
  COMPONENT: {
    fields: {
      parentComponent: {
        required: false,
        type: 'string',
      },
    },
  },
};

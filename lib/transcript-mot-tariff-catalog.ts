import type { TranscriptMotRules } from "@/lib/transcript-mot-tariff-rules";

export type TranscriptMotTariffRow = {
  code: string;
  label: string;
  sortOrder: number;
  rules: TranscriptMotRules;
};

/** Source of truth for MOT transcript tariffs (mirrored in scripts/sql/supabase_transcript_mot_tariffs.sql). */
export const TRANSCRIPT_MOT_TARIFF_CATALOG: TranscriptMotTariffRow[] = [
  {
    code: "Main-ISR-2023-MOT",
    label: "Main-ISR-2023-MOT",
    sortOrder: 1,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 58.9, perKm: 5.9 },
        },
      ],
    },
  },
  {
    code: "SPECIAL_MOT_MONE_AlonDaniel",
    label: "SPECIAL_MOT_MONE_AlonDaniel",
    sortOrder: 2,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 45, perKm: 4 },
        },
      ],
    },
  },
  {
    code: "SPECIAL_MOT_MONE_Hyundai",
    label: "SPECIAL_MOT_MONE_Hyundai",
    sortOrder: 3,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 53.1, perKm: 4.13 },
        },
      ],
    },
  },
  {
    code: "SPECIAL_MOT_MONE_ISRAYOM",
    label: "SPECIAL_MOT_MONE_ISRAYOM",
    sortOrder: 4,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 6,
          fromMinute: 0,
          toHour: 21,
          toMinute: 0,
          model: { type: "tiered_km", base: 54, firstKm: 10, rateFirst: 5.31, rateAfter: 7.08 },
        },
        {
          wrap: true,
          fromHour: 21,
          fromMinute: 1,
          toHour: 5,
          toMinute: 59,
          model: { type: "linear", base: 54, perKm: 5.9 },
        },
      ],
    },
  },
  {
    code: "SPECIAL_MOT_MONE_SAMELET",
    label: "SPECIAL_MOT_MONE_SAMELET",
    sortOrder: 5,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "tiered_km", base: 58.9, firstKm: 10, rateFirst: 5.9, rateAfter: 7.08 },
        },
      ],
    },
  },
  {
    code: "SPECIAL_MOT_MONE_Shevat_Achim",
    label: "SPECIAL_MOT_MONE_Shevat_Achim",
    sortOrder: 6,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 48.84, perKm: 4.72 },
        },
      ],
    },
  },
  {
    code: "SPECIAL_MOT_MONE_SHIRUTNIKAYON",
    label: "SPECIAL_MOT_MONE_SHIRUTNIKAYON",
    sortOrder: 7,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 47.2, perKm: 4.72 },
        },
      ],
    },
  },
  {
    code: "SPECIAL_MOT_MONE_Shufersal",
    label: "SPECIAL_MOT_MONE_Shufersal",
    sortOrder: 8,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 5,
          fromMinute: 0,
          toHour: 15,
          toMinute: 0,
          model: { type: "linear", base: 50, perKm: 5.4 },
        },
        {
          wrap: true,
          fromHour: 15,
          fromMinute: 1,
          toHour: 4,
          toMinute: 59,
          model: { type: "linear", base: 50, perKm: 4.5 },
        },
      ],
    },
  },
  {
    code: "SPECIAL_MOT_MONE_Yahav",
    label: "SPECIAL_MOT_MONE_Yahav",
    sortOrder: 9,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 53.1, perKm: 5.31 },
        },
      ],
    },
  },
  {
    code: "SPECIAL_MOT_MONE_YangoDeli",
    label: "SPECIAL_MOT_MONE_YangoDeli",
    sortOrder: 10,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 47.2, perKm: 5.428 },
        },
      ],
    },
  },
  {
    code: "SPECIAL_MOT_MONE_ZHAK",
    label: "SPECIAL_MOT_MONE_ZHAK",
    sortOrder: 11,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "tiered_km", base: 54, firstKm: 10, rateFirst: 5.9, rateAfter: 7.08 },
        },
      ],
    },
  },
  {
    code: "Main-ISR-2023-MOT_Summit_B2B",
    label: "Main-ISR-2023-MOT_Summit_B2B",
    sortOrder: 12,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 53.1, perKm: 5.9 },
        },
      ],
    },
  },
  {
    code: "Main-ISR-2023-MOT_VIP_B2B",
    label: "Main-ISR-2023-MOT_VIP_B2B",
    sortOrder: 13,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 47.2, perKm: 5.9 },
        },
      ],
    },
  },
  {
    code: "Main-ISR-2023-MOT_SUPER_VIP_B2B",
    label: "Main-ISR-2023-MOT_SUPER_VIP_B2B",
    sortOrder: 14,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 41.3, perKm: 5.9 },
        },
      ],
    },
  },
  {
    code: "Main-ISR-2023-MOT_PRIME_B2B",
    label: "Main-ISR-2023-MOT_PRIME_B2B",
    sortOrder: 15,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 29.5, perKm: 5.9 },
        },
      ],
    },
  },
  {
    code: "2271496/21.Public_MOT_lower",
    label: "2271496/21.Public_MOT_lower",
    sortOrder: 16,
    rules: {
      version: 1,
      segments: [
        {
          wrap: false,
          fromHour: 0,
          fromMinute: 0,
          toHour: 23,
          toMinute: 59,
          model: { type: "linear", base: 43.29, perKm: 5.34 },
        },
      ],
    },
  },
];

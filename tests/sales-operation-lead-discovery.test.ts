import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateRulesScore,
  finalizeQualification,
  passesSizeFilter,
  qualificationFromScore,
} from "../lib/sales-operation/lead-discovery/rules-engine.ts";
import { evaluateSegmentConditions } from "../lib/sales-operation/lead-discovery/segments.ts";
import type { LeadDiscoveryRow } from "../lib/sales-operation/lead-discovery/types.ts";

describe("lead discovery rules engine", () => {
  it("maps score bands", () => {
    assert.equal(qualificationFromScore(85), "high_potential");
    assert.equal(qualificationFromScore(70), "medium_potential");
    assert.equal(qualificationFromScore(45), "low_potential");
    assert.equal(qualificationFromScore(10), "disqualified");
  });

  it("enforces size modes", () => {
    assert.equal(passesSizeFilter("50-99", "Medium", "strict_50_plus").pass, true);
    assert.equal(passesSizeFilter("11-49", "High", "strict_50_plus").pass, false);
    assert.equal(passesSizeFilter("Unknown", "Medium", "likely_50_plus").pass, true);
    // Unknown size stays eligible so Places campaigns can produce reviewable candidates
    assert.equal(passesSizeFilter("Unknown", "Low", "likely_50_plus").pass, true);
    assert.equal(passesSizeFilter("Unknown", "Low", "include_unknown").pass, true);
    assert.equal(passesSizeFilter("1-10", "High", "include_unknown").pass, false);
  });

  it("scores hotels with public email", () => {
    const result = calculateRulesScore(
      {
        placeId: "x",
        name: "Test Hotel",
        category: "lodging",
        categories: ["lodging"],
        publicEmails: [{ email: "hr@hotel.co.il", type: "HR" }],
        phone: "+972501234567",
        website: "https://hotel.co.il",
        reviewsCount: 200,
        signals: { category_hotel: true, public_email: true, public_phone: true, size_50_plus: true },
      },
      [
        { name: "Hotel", signalKey: "category_hotel", weight: 30, enabled: true, isDisqualify: false },
        { name: "50+", signalKey: "size_50_plus", weight: 20, enabled: true, isDisqualify: false },
        { name: "Email", signalKey: "public_email", weight: 10, enabled: true, isDisqualify: false },
        { name: "Phone", signalKey: "public_phone", weight: 5, enabled: true, isDisqualify: false },
      ],
    );
    assert.ok(result.baseScore >= 60);
    const final = finalizeQualification({
      baseScore: result.baseScore,
      llmAdjustment: 5,
      breakdown: result.breakdown,
      size: result.size,
      company: {
        placeId: "x",
        name: "Test Hotel",
        publicEmails: [{ email: "hr@hotel.co.il", type: "HR" }],
        phone: "+97250",
        signals: result.signals,
      },
      mode: "hybrid",
      llm: { scoreAdjustment: 5 },
      companySizeMode: "likely_50_plus",
      minTaxiScore: 60,
    });
    assert.equal(final.llmAdjustment, 5);
    assert.ok(final.stickerKeys.includes("cold_lead"));
  });

  it("clamps LLM adjustment to ±10", () => {
    const final = finalizeQualification({
      baseScore: 50,
      llmAdjustment: 50,
      breakdown: [],
      size: { estimate: "50-99", confidence: "Medium" },
      company: { placeId: "1", name: "Co", signals: {} },
      mode: "hybrid",
      companySizeMode: "likely_50_plus",
      minTaxiScore: 40,
    });
    assert.equal(final.llmAdjustment, 10);
    assert.equal(final.finalScore, 60);
  });
});

describe("discovery segments", () => {
  const row: LeadDiscoveryRow = {
    id: "disc-1",
    leadId: "1",
    campaignId: null,
    runId: null,
    companyName: "Acme",
    email: null,
    phone: null,
    address: null,
    googlePlaceId: null,
    domain: "a.co.il",
    website: "https://a.co.il",
    city: "Tel Aviv",
    district: null,
    country: "Israel",
    latitude: null,
    longitude: null,
    googleCategory: "hotel",
    businessCategories: [],
    rating: null,
    reviewsCount: null,
    businessStatus: null,
    source: "google_places",
    sourceUrl: null,
    employeeSizeEstimate: "50-99",
    employeeSizeConfidence: "Medium",
    taxiPotentialScore: 82,
    qualificationStatus: "high_potential",
    scoreBreakdown: [],
    confirmedSignals: [],
    inferredSignals: [],
    missingInformation: [],
    recommendedUseCases: [],
    recommendedDepartment: null,
    emailPersonalisationLine: null,
    dataCompletenessScore: 0,
    llmConfidence: null,
    llmModel: null,
    llmPromptVersion: null,
    qualificationMode: "hybrid",
    websiteContentHash: null,
    enrichment: {},
    pendingStickerKeys: [],
    requiresManualReview: false,
    doNotContact: false,
    duplicateConfidence: null,
    discoveredAt: new Date().toISOString(),
    lastEnrichedAt: null,
    lastQualifiedAt: null,
    approvedAt: null,
  };

  it("matches Ready for Outreach conditions", () => {
    const ok = evaluateSegmentConditions(row, {
      op: "and",
      rules: [
        { field: "qualification", op: "eq", value: "high_potential" },
        { field: "doNotContact", op: "eq", value: false },
        { field: "taxiPotentialScore", op: "gte", value: 80 },
      ],
    });
    assert.equal(ok, true);
  });
});

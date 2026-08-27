// rule based intent detection

function classifyIntent(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return 'chat';

  // Explanations / questions stay in chat
  if (/^(how (do|can|would) i|what (is|does)|explain|tell me|can i|should i)\b/.test(t)) {
    return 'chat';
  }

  const hasBuildVerb = /\b(build|generate|create|make|set up|setup|draft)\b/.test(t);
  const hasCycleNoun = /\b(cycle|workflow|protocol|system|graph|canvas)\b/.test(t);
  const labRe =
    /\b(electroporate|electroporation|incubate|transform|transformation|od|optical density|transfer|aliquot|dispense|heat shock|grow)\b/g;
  const labHits = t.match(labRe) || [];
  const hasLabPhrase = labHits.length > 0;
  const hasSequence = /\b(then|after|followed by|and then)\b/.test(t);

  // "build a cycle that…" / "generate a transform workflow"
  if (hasBuildVerb && (hasCycleNoun || hasLabPhrase)) {
    return 'generate_cycle';
  }

  // Natural lab speak (i think)
  if (hasLabPhrase && (hasSequence || labHits.length >= 2)) {
    return 'generate_cycle';
  }

  return 'chat';
}

module.exports = { classifyIntent };

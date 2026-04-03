function normalizeLookupValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[【】[\]()（）{}"'`]/g, '')
    .replace(/[_\-\s./\\:：|]+/g, '');
}

function tokenizeLookupValue(value: string): string[] {
  const expanded = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[【】[\]()（）{}"'`]/g, ' ')
    .replace(/[_\-\s./\\:：|]+/g, ' ')
    .trim()
    .toLowerCase();

  const tokens = expanded
    .split(/\s+/)
    .map((token) => normalizeLookupValue(token))
    .filter(Boolean);
  const collapsed = normalizeLookupValue(value);

  if (collapsed && !tokens.includes(collapsed)) {
    tokens.push(collapsed);
  }

  return Array.from(new Set(tokens));
}

function scoreFieldMatch(requestedField: string, candidateField: string): number {
  if (!requestedField || !candidateField) {
    return 0;
  }

  if (requestedField === candidateField) {
    return 1000;
  }

  const requestedTrimmed = requestedField.trim();
  const candidateTrimmed = candidateField.trim();

  if (requestedTrimmed === candidateTrimmed) {
    return 980;
  }

  if (requestedTrimmed.toLowerCase() === candidateTrimmed.toLowerCase()) {
    return 960;
  }

  const requestedNormalized = normalizeLookupValue(requestedTrimmed);
  const candidateNormalized = normalizeLookupValue(candidateTrimmed);
  const candidateLabelNormalized = normalizeLookupValue(toDisplayFieldLabel(candidateTrimmed));

  if (!requestedNormalized || !candidateNormalized) {
    return 0;
  }

  if (requestedNormalized === candidateNormalized) {
    return 920;
  }

  if (requestedNormalized === candidateLabelNormalized) {
    return 900;
  }

  const lengthPenalty = Math.min(Math.abs(candidateNormalized.length - requestedNormalized.length), 80);
  if (
    candidateNormalized.includes(requestedNormalized)
    || candidateLabelNormalized.includes(requestedNormalized)
  ) {
    return 780 - lengthPenalty;
  }

  if (
    requestedNormalized.includes(candidateNormalized)
    || requestedNormalized.includes(candidateLabelNormalized)
  ) {
    return 760 - lengthPenalty;
  }

  const requestedTokens = tokenizeLookupValue(requestedTrimmed);
  const candidateTokens = new Set([
    ...tokenizeLookupValue(candidateTrimmed),
    ...tokenizeLookupValue(toDisplayFieldLabel(candidateTrimmed)),
  ]);

  if (requestedTokens.length === 0 || candidateTokens.size === 0) {
    return 0;
  }

  const matchedCount = requestedTokens.filter((token) => candidateTokens.has(token)).length;
  if (matchedCount === requestedTokens.length) {
    return 720 - (Math.abs(candidateTokens.size - requestedTokens.length) * 5);
  }

  const matchRatio = matchedCount / requestedTokens.length;
  if (matchRatio >= 0.6) {
    return 620 + Math.round(matchRatio * 40);
  }

  return 0;
}

export function toDisplayFieldLabel(field: string): string {
  return field
    .replace(/'/g, '')
    .replace(/\[|\]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/__/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveFieldReference(
  requestedField: string | null | undefined,
  availableFields: readonly string[]
): string | undefined {
  const requested = requestedField?.trim();
  if (!requested || availableFields.length === 0) {
    return undefined;
  }

  let bestField: string | undefined;
  let bestScore = 0;

  availableFields.forEach((field) => {
    const score = scoreFieldMatch(requested, field);
    if (score > bestScore) {
      bestScore = score;
      bestField = field;
      return;
    }

    if (score === bestScore && bestField) {
      const currentDistance = Math.abs(field.length - requested.length);
      const previousDistance = Math.abs(bestField.length - requested.length);
      if (currentDistance < previousDistance) {
        bestField = field;
      }
    }
  });

  return bestScore > 0 ? bestField : undefined;
}

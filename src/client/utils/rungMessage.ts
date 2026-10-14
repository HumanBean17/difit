// The trailer-like lines git-review-ladder writes into a rung's message body.
export interface RungMessage {
  verify: string[];
  proof?: string;
  oversize?: string;
  notes: string[];
}

const KEY_PATTERN = /^(Verify|Proof|Oversize):\s*(.*)$/;

function splitClaims(text: string): string[] {
  return text
    .split(/;\s+|\n/)
    .map((claim) => claim.replace(/^[-*•]\s*/, '').trim())
    .filter((claim) => claim.length > 0);
}

export function parseRungMessage(body: string): RungMessage {
  const sections: Record<'Verify' | 'Proof' | 'Oversize', string[]> = {
    Verify: [],
    Proof: [],
    Oversize: [],
  };
  const notes: string[] = [];
  let current: keyof typeof sections | null = null;

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd();
    const match = KEY_PATTERN.exec(line.trim());
    if (match) {
      current = match[1] as keyof typeof sections;
      if (match[2]) sections[current].push(match[2]);
      continue;
    }
    if (line.trim() === '') {
      current = null;
      continue;
    }
    if (current) sections[current].push(line.trim());
    else notes.push(line.trim());
  }

  return {
    verify: splitClaims(sections.Verify.join('\n')),
    ...(sections.Proof.length > 0 ? { proof: sections.Proof.join(' ') } : {}),
    ...(sections.Oversize.length > 0 ? { oversize: sections.Oversize.join(' ') } : {}),
    notes,
  };
}

const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s_\-·/]+/g, ' ').trim();
const synonyms = [['立杆', '支撑杆', 'post'], ['起偏', '偏振片', 'polarizer'], ['分光', '分束', 'splitter'], ['摄像', '相机', 'camera'], ['准直', 'collimator'], ['波片', 'waveplate']];

function subsequence(query, text) {
  let index = 0;
  for (const character of text) if (character === query[index]) index++;
  return index === query.length;
}

function oneEditAway(query, word) {
  if (Math.abs(query.length - word.length) > 1) return false;
  let left = 0, right = 0, edits = 0;
  while (left < query.length && right < word.length) {
    if (query[left] === word[right]) { left++; right++; continue; }
    if (++edits > 1) return false;
    if (query.length >= word.length) left++;
    if (word.length >= query.length) right++;
  }
  return edits + Number(left < query.length || right < word.length) <= 1;
}

export function searchScore(text, query) {
  const haystack = normalize(text), terms = normalize(query).split(' ').filter(Boolean);
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) { score += haystack === term ? 200 : haystack.startsWith(term) ? 100 : 70; continue; }
    const related = synonyms.find(words => words.includes(term));
    if (related?.some(word => haystack.includes(word))) { score += 55; continue; }
    if (term.length >= 2 && subsequence(term, haystack.replaceAll(' ', ''))) { score += 35; continue; }
    if (/^[a-z]{4,32}$/.test(term) && haystack.split(/[^a-z]+/).some(word => oneEditAway(term, word))) { score += 20; continue; }
    return -1;
  }
  return score;
}

export function searchDevices(definitions, query, category = '全部') {
  return definitions.map((definition, index) => ({
    definition, index,
    score: searchScore([definition.name, definition.code, definition.id, definition.aliases, definition.category].join(' '), query)
  })).filter(entry => entry.score >= 0 && (category === '全部' || entry.definition.category === category))
    .sort((left, right) => right.score - left.score || left.index - right.index).map(entry => entry.definition);
}

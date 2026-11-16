/**
 * The studio mock.
 *
 * A drawing of the extension panel itself: recorder, player, karaoke view and
 * take memory. Generated (not hand-typed) so the waveform bars land on a real
 * envelope and the layout stays on a 4 px grid.
 *
 * It is an illustration of the product, so the product's own colours (cyan
 * waveform, navy karaoke panel, red REC) are fixed here rather than themed.
 */

const C = {
  navy: '#0b1233',
  inkDark: '#eaf0ff',
  softDark: '#8fa2c8',
  red: '#f43f5e',
  cyan: '#38bdf8',
  cyanDeep: '#0284c7',
  gold: '#eab308',
  sun: '#f4d774',
  ok: '#34d399'
};

const bar = (x, y, w, h, r = 3, fill = C.cyan) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;

const txt = (x, y, s, size, cls, weight = 600, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" class="${cls}">${s}</text>`;

export function appMock() {
  const parts = [];

  // ---------- shell ----------
  parts.push(`<rect class="m-panel" x="10" y="10" width="660" height="610" rx="30"/>`);

  // ---------- header ----------
  parts.push(`<g>
    <rect x="30" y="30" width="38" height="38" rx="12" fill="${C.navy}"/>
    ${bar(40, 45, 4, 8, 2, C.gold)}${bar(48, 38, 4, 22, 2, C.sun)}${bar(56, 41, 4, 16, 2, C.gold)}
    ${txt(80, 49, 'TabTune Studio', 18, 'm-ink', 700)}
    <rect class="m-chip" x="212" y="38" width="42" height="21" rx="10.5"/>
    ${txt(233, 52, 'v1.2', 11, 'm-accent', 700, 'middle')}
    <rect class="m-btn" x="556" y="36" width="26" height="26" rx="9"/>
    <path class="m-stroke" d="M562.5 49h13M569 42.5v13"/>
    <rect class="m-btn" x="590" y="36" width="26" height="26" rx="9"/>
    <circle class="m-stroke" cx="603" cy="49" r="5.4"/>
    <path class="m-stroke" d="M603 41.2v3.2M603 53.6v3.2M594.6 49h3.2M608.2 49h3.2"/>
    <rect class="m-btn" x="624" y="36" width="26" height="26" rx="9"/>
    <path class="m-stroke" d="M637 44.5a6.5 6.5 0 1 0 0 9M637 44.5a6.5 6.5 0 0 1 0 9"/>
  </g>`);

  // ---------- recorder card ----------
  parts.push(`<rect class="m-card" x="30" y="86" width="620" height="196" rx="20"/>`);

  // visualizer
  parts.push(`<rect class="m-well" x="44" y="98" width="592" height="76" rx="14"/>`);
  const bars = [];
  const n = 30;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // a plausible music envelope: loud middle, breathing edges
    const env =
      0.32 +
      0.42 * Math.abs(Math.sin(i * 0.78 + 0.4)) +
      0.26 * Math.abs(Math.sin(i * 0.31 + 1.7)) * Math.sin(t * Math.PI);
    const h = Math.max(4, Math.min(52, env * 46));
    const x = 58 + i * 18.8;
    bars.push(bar(x, 160 - h, 8, h, 3, i % 7 === 3 ? C.cyanDeep : C.cyan));
  }
  parts.push(bars.join(''));
  parts.push(`<rect class="m-pill" x="560" y="106" width="62" height="22" rx="11"/>
    ${txt(591, 121, '01:24', 12, 'm-accent', 700, 'middle')}`);

  // record button + discard
  parts.push(`<g>
    <rect x="44" y="188" width="330" height="46" rx="14" fill="${C.red}"/>
    <rect x="66" y="205" width="14" height="14" rx="3" fill="#fff"/>
    ${txt(94, 216, 'Stop &amp; Finish Recording', 14, 'm-onred', 700)}
    <rect class="m-btn" x="386" y="188" width="96" height="46" rx="14"/>
    ${txt(434, 216, 'Discard', 13, 'm-soft', 700, 'middle')}
    <rect class="m-btn" x="494" y="188" width="70" height="46" rx="14"/>
    ${txt(529, 216, 'WebM', 13, 'm-soft', 700, 'middle')}
    <rect class="m-btn" x="574" y="188" width="62" height="46" rx="14"/>
    ${txt(605, 216, '320k', 13, 'm-soft', 700, 'middle')}
  </g>`);

  // countdown row
  parts.push(`<g>
    <rect class="m-check" x="44" y="248" width="18" height="18" rx="5"/>
    <path class="m-checkmark" d="M48.5 257.2l3.4 3.4 6.6-7"/>
    ${txt(70, 262, 'Countdown before recording', 12, 'm-soft', 600)}
    <rect class="m-btn" x="576" y="246" width="60" height="22" rx="11"/>
    ${txt(606, 261, '5s', 11, 'm-soft', 700, 'middle')}
  </g>`);

  // ---------- take memory ----------
  parts.push(`<g>
    ${txt(44, 306, 'Take Memory', 13, 'm-ink', 700)}
    ${txt(650, 306, '3 saved', 12, 'm-faint', 600, 'end')}
    <rect class="m-row" x="44" y="316" width="592" height="46" rx="13"/>
    <circle cx="70" cy="339" r="8" fill="${C.ok}"/>
    ${txt(88, 336, 'Komasava — take 3', 12.5, 'm-ink', 700)}
    ${txt(88, 351, '03:28 · webm · 14 Nov, 21:40', 11, 'm-faint', 600)}
    <rect class="m-btn" x="524" y="328" width="52" height="22" rx="11"/>
    ${txt(550, 343, 'Load', 11, 'm-soft', 700, 'middle')}
    <rect class="m-btn" x="586" y="328" width="34" height="22" rx="11"/>
    <path class="m-stroke" d="M597.5 334.5l7 7M604.5 334.5l-7 7"/>
    <rect class="m-row" x="44" y="368" width="592" height="46" rx="13"/>
    <circle cx="70" cy="391" r="8" class="m-dim"/>
    ${txt(88, 388, 'Nitarudi — take 2', 12.5, 'm-soft', 700)}
    ${txt(88, 403, '02:51 · wav · 13 Nov, 18:02', 11, 'm-faint', 600)}
    <rect class="m-btn" x="524" y="380" width="52" height="22" rx="11"/>
    ${txt(550, 395, 'Load', 11, 'm-soft', 700, 'middle')}
    <rect class="m-btn" x="586" y="380" width="34" height="22" rx="11"/>
    <path class="m-stroke" d="M597.5 386.5l7 7M604.5 386.5l-7 7"/>
  </g>`);

  // ---------- karaoke card ----------
  parts.push(`<g>
    <rect x="30" y="432" width="300" height="168" rx="20" fill="${C.navy}"/>
    ${txt(50, 462, 'Karaoke Sync', 13, 'm-kara-title', 700)}
    ${txt(310, 462, '00:41 / 03:28', 11, 'm-kara-faint', 600, 'end')}
    <rect x="50" y="474" width="260" height="5" rx="2.5" fill="#1e2a4d"/>
    <rect x="50" y="474" width="112" height="5" rx="2.5" fill="${C.cyan}"/>
    <circle cx="162" cy="476.5" r="6.5" fill="${C.cyan}"/>
    ${txt(50, 506, '[00:12.50] Hapa ndipo wimbo unapoanza', 12, 'm-kara-line', 600)}
    ${txt(50, 530, '[00:16.80] Mistari inasawazishwa na sauti', 12, 'm-kara-line', 600)}
    <rect class="m-kara-active" x="42" y="546" width="276" height="30" rx="10"/>
    ${txt(50, 565, '[00:21.40] Na wimbo unakwenda juu…', 12.5, 'm-kara-hot', 800)}
    ${txt(50, 590, '[00:26.10] Sauti inarudi tena', 12, 'm-kara-line', 600)}
  </g>`);

  // ---------- player + export card ----------
  parts.push(`<g>
    <rect class="m-card" x="350" y="432" width="300" height="168" rx="20"/>
    ${txt(370, 462, 'Studio Player', 13, 'm-ink', 700)}
    <circle cx="360" cy="458" r="4" fill="${C.ok}"/>
    ${txt(630, 462, 'Export', 12, 'm-accent', 700, 'end')}
    <rect x="370" y="478" width="260" height="6" rx="3" class="m-track"/>
    <rect x="370" y="478" width="96" height="6" rx="3" fill="${C.cyan}"/>
    <circle cx="466" cy="481" r="7" fill="${C.cyan}"/>
    <g>
      <rect class="m-btn" x="370" y="500" width="80" height="30" rx="10"/>
      ${txt(410, 519, '−3s', 12, 'm-soft', 700, 'middle')}
      <rect x="460" y="500" width="82" height="30" rx="10" fill="${C.cyanDeep}"/>
      <path d="M482 509.5l12 5.5-12 5.5z" fill="#fff"/>
      ${txt(516, 519, 'Pause', 12, 'm-onblue', 700)}
      <rect class="m-btn" x="552" y="500" width="78" height="30" rx="10"/>
      ${txt(591, 519, '+3s', 12, 'm-soft', 700, 'middle')}
    </g>
    <g>
      <rect class="m-btn" x="370" y="544" width="126" height="36" rx="12"/>
      ${txt(433, 567, 'Transcribe', 12.5, 'm-soft', 700, 'middle')}
      <rect class="m-btn" x="504" y="544" width="126" height="36" rx="12"/>
      ${txt(567, 567, 'Fetch online', 12.5, 'm-soft', 700, 'middle')}
    </g>
  </g>`);

  return `<svg class="mock" viewBox="0 0 680 630" role="img" aria-label="The TabTune Studio panel: a live waveform being recorded, the take memory list, a karaoke view with the current line highlighted, and the studio player." xmlns="http://www.w3.org/2000/svg">
    ${parts.join('\n    ')}
  </svg>`;
}

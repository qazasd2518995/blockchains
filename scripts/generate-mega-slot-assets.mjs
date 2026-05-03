import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/web/public/slots');

const themes = [
  {
    dir: 'thunder',
    title: 'THUNDER HAMMER',
    accent: '#facc15',
    accent2: '#60a5fa',
    dark: '#111827',
    glow: '#f97316',
    symbolLabels: ['RUNE', 'SHIELD', 'AXE', 'STORM', 'HAMMER', 'THUNDER'],
    shapes: ['rune', 'shield', 'axe', 'storm', 'hammer', 'bolt'],
  },
  {
    dir: 'dragon-mega',
    title: 'DRAGON BLAZE',
    accent: '#f97316',
    accent2: '#22c55e',
    dark: '#160b08',
    glow: '#ef4444',
    symbolLabels: ['EMBER', 'COIN', 'FANG', 'ORB', 'SCALE', 'DRAGON'],
    shapes: ['flame', 'coin', 'fang', 'orb', 'scale', 'dragon'],
  },
  {
    dir: 'nebula',
    title: 'NEBULA FORTUNE',
    accent: '#22d3ee',
    accent2: '#c084fc',
    dark: '#06091f',
    glow: '#f472b6',
    symbolLabels: ['COMET', 'PLANET', 'CRYSTAL', 'PORTAL', 'NOVA', 'GALAXY'],
    shapes: ['comet', 'planet', 'crystal', 'portal', 'nova', 'galaxy'],
  },
  {
    dir: 'jungle',
    title: 'JUNGLE RELIC',
    accent: '#22c55e',
    accent2: '#facc15',
    dark: '#071509',
    glow: '#86efac',
    symbolLabels: ['LEAF', 'IDOL', 'MASK', 'SERPENT', 'EMERALD', 'RELIC'],
    shapes: ['leaf', 'idol', 'mask', 'serpent', 'emerald', 'relic'],
  },
  {
    dir: 'vampire',
    title: 'VAMPIRE CASTLE',
    accent: '#fb7185',
    accent2: '#a78bfa',
    dark: '#100711',
    glow: '#ef4444',
    symbolLabels: ['ROSE', 'CANDLE', 'RAVEN', 'GOBLET', 'MOON', 'CASTLE'],
    shapes: ['rose', 'candle', 'raven', 'goblet', 'moon', 'castle'],
  },
];

function safeMkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeAsset(theme, name, content) {
  const dir = path.join(root, theme.dir);
  safeMkdir(dir);
  fs.writeFileSync(path.join(dir, name), content);
}

function esc(text) {
  return text.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[ch]);
}

function defs(theme, id) {
  return `
  <defs>
    <linearGradient id="${id}-bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${theme.dark}"/>
      <stop offset="0.45" stop-color="#07111f"/>
      <stop offset="1" stop-color="${theme.dark}"/>
    </linearGradient>
    <radialGradient id="${id}-glow" cx="50%" cy="48%" r="58%">
      <stop offset="0" stop-color="${theme.accent}" stop-opacity="0.92"/>
      <stop offset="0.38" stop-color="${theme.glow}" stop-opacity="0.36"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}-gold" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#fff3a7"/>
      <stop offset="0.36" stop-color="${theme.accent}"/>
      <stop offset="0.72" stop-color="#9a6416"/>
      <stop offset="1" stop-color="#fff1a1"/>
    </linearGradient>
    <filter id="${id}-soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="12"/>
    </filter>
    <filter id="${id}-shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity="0.55"/>
      <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="${theme.accent}" flood-opacity="0.52"/>
    </filter>
  </defs>`;
}

function stageMotif(theme, id) {
  const rails = Array.from({ length: 9 }, (_, i) => {
    const x = 145 + i * 112;
    return `<rect x="${x}" y="130" width="18" height="440" rx="9" fill="${theme.accent2}" opacity="${0.09 + (i % 3) * 0.04}"/>
      <circle cx="${x + 9}" cy="155" r="15" fill="${theme.accent}" opacity="0.42"/>
      <circle cx="${x + 9}" cy="515" r="9" fill="${theme.accent2}" opacity="0.52"/>`;
  }).join('\n');
  const coins = Array.from({ length: 22 }, (_, i) => {
    const x = 55 + ((i * 97) % 1090);
    const y = 605 + ((i * 19) % 52);
    const r = 8 + (i % 5);
    return `<ellipse cx="${x}" cy="${y}" rx="${r * 1.7}" ry="${r}" fill="url(#${id}-gold)" opacity="${0.25 + (i % 4) * 0.08}"/>`;
  }).join('\n');
  return `
    <rect x="0" y="0" width="1200" height="720" fill="url(#${id}-bg)"/>
    <ellipse cx="600" cy="330" rx="420" ry="245" fill="url(#${id}-glow)" filter="url(#${id}-soft)" opacity="0.82"/>
    <path d="M0 500 C230 410 390 485 600 430 C820 372 995 420 1200 335 L1200 720 L0 720 Z" fill="#020617" opacity="0.7"/>
    ${rails}
    ${coins}
    <rect x="60" y="82" width="1080" height="535" rx="34" fill="none" stroke="${theme.accent}" stroke-opacity="0.35" stroke-width="4"/>
    <rect x="82" y="104" width="1036" height="491" rx="28" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>
  `;
}

function coverSvg(theme) {
  const id = `cover-${theme.dir}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
${defs(theme, id)}
${stageMotif(theme, id)}
<g filter="url(#${id}-shadow)">
  <rect x="208" y="180" width="784" height="320" rx="34" fill="#08111f" stroke="url(#${id}-gold)" stroke-width="5"/>
  ${[0, 1, 2, 3, 4].map((i) => `<rect x="${235 + i * 150}" y="208" width="120" height="264" rx="24" fill="#0b1628" stroke="${theme.accent}" stroke-opacity="0.42" stroke-width="4"/>`).join('\n  ')}
  ${theme.shapes.map((shape, i) => iconSvg(shape, 295 + (i % 5) * 150, 285 + Math.floor(i / 5) * 116, 80, theme, id)).join('\n  ')}
</g>
<g>
  <text x="90" y="118" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="800" letter-spacing="10" fill="${theme.accent}" opacity="0.9">MEGA 5x6</text>
  <text x="90" y="168" font-family="Inter, Arial, sans-serif" font-size="58" font-weight="900" fill="#fff" letter-spacing="3">${esc(theme.title)}</text>
  <text x="92" y="220" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="700" fill="#cbd5e1">WAYS • SMALL PAYS • BIG WIN</text>
</g>
<g transform="translate(926 96)">
  <rect width="190" height="70" rx="35" fill="#111827" stroke="${theme.accent}" stroke-opacity="0.6" stroke-width="3"/>
  <text x="95" y="45" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="27" font-weight="900" fill="${theme.accent}">NEW</text>
</g>
</svg>`;
}

function backgroundSvg(theme) {
  const id = `bg-${theme.dir}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
${defs(theme, id)}
<rect width="1600" height="900" fill="url(#${id}-bg)"/>
<ellipse cx="800" cy="430" rx="565" ry="325" fill="url(#${id}-glow)" filter="url(#${id}-soft)" opacity="0.7"/>
${Array.from({ length: 16 }, (_, i) => {
  const x = 95 + i * 94;
  const h = 410 + (i % 5) * 28;
  return `<rect x="${x}" y="${220 - (i % 3) * 28}" width="26" height="${h}" rx="13" fill="${i % 2 ? theme.accent : theme.accent2}" opacity="${0.08 + (i % 4) * 0.03}"/>
  <circle cx="${x + 13}" cy="${218 - (i % 3) * 28}" r="20" fill="${theme.accent}" opacity="0.33"/>`;
}).join('\n')}
<path d="M0 670 C230 575 460 625 710 555 C960 485 1220 520 1600 395 L1600 900 L0 900 Z" fill="#020617" opacity="0.78"/>
<path d="M140 700 C400 610 610 640 815 590 C1030 540 1260 560 1480 498" fill="none" stroke="${theme.accent}" stroke-width="4" stroke-opacity="0.2"/>
<rect x="60" y="72" width="1480" height="740" rx="38" fill="none" stroke="${theme.accent}" stroke-opacity="0.26" stroke-width="4"/>
<rect x="90" y="102" width="1420" height="680" rx="32" fill="none" stroke="#fff" stroke-opacity="0.08" stroke-width="2"/>
<text x="800" y="100" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="900" letter-spacing="12" fill="${theme.accent}" opacity="0.42">${esc(theme.title)}</text>
</svg>`;
}

function symbolsSvg(theme) {
  const id = `sym-${theme.dir}`;
  const cells = theme.symbolLabels.map((label, i) => {
    const x = (i % 3) * 300;
    const y = Math.floor(i / 3) * 300;
    const cx = x + 150;
    const cy = y + 132;
    return `<g transform="translate(${x} ${y})">
      <rect x="10" y="10" width="280" height="280" rx="38" fill="#07111f" stroke="url(#${id}-gold)" stroke-width="7"/>
      <rect x="24" y="24" width="252" height="252" rx="30" fill="#101a2c" stroke="${i % 2 ? theme.accent2 : theme.accent}" stroke-opacity="0.45" stroke-width="4"/>
      <ellipse cx="150" cy="126" rx="92" ry="72" fill="${theme.glow}" opacity="0.18" filter="url(#${id}-soft)"/>
      ${iconSvg(theme.shapes[i], cx - x, cy - y, 112, theme, id)}
      <text x="150" y="248" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="900" letter-spacing="2" fill="#fff">${esc(label)}</text>
    </g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
${defs(theme, id)}
<rect width="900" height="600" fill="#020617"/>
${cells}
</svg>`;
}

function iconSvg(shape, x, y, size, theme, id) {
  const s = size;
  const c = theme.accent;
  const c2 = theme.accent2;
  const g = theme.glow;
  const common = `stroke-linecap="round" stroke-linejoin="round"`;
  const text = (t, fs = 44) => `<text x="${x}" y="${y + fs / 3}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${fs}" font-weight="900" fill="${c}">${t}</text>`;
  switch (shape) {
    case 'rune':
      return `<g filter="url(#${id}-shadow)"><polygon points="${x},${y - s * .5} ${x + s * .28},${y + s * .18} ${x},${y + s * .5} ${x - s * .28},${y + s * .18}" fill="${c2}" opacity=".2" stroke="${c}" stroke-width="8"/><path d="M${x} ${y - s * .34} L${x} ${y + s * .32} M${x - s * .2} ${y - s * .08} L${x + s * .22} ${y + s * .1}" ${common} stroke="#fff" stroke-width="7" opacity=".8"/></g>`;
    case 'shield':
      return `<g filter="url(#${id}-shadow)"><path d="M${x} ${y - s * .5} L${x + s * .4} ${y - s * .3} L${x + s * .32} ${y + s * .28} L${x} ${y + s * .54} L${x - s * .32} ${y + s * .28} L${x - s * .4} ${y - s * .3} Z" fill="${c}" opacity=".18" stroke="${c}" stroke-width="8"/><path d="M${x} ${y - s * .35} V${y + s * .34}" stroke="${c2}" stroke-width="7"/></g>`;
    case 'axe':
      return `<g filter="url(#${id}-shadow)"><path d="M${x - s * .34} ${y + s * .42} L${x + s * .28} ${y - s * .36}" stroke="${c}" stroke-width="13"/><path d="M${x + s * .12} ${y - s * .5} C${x + s * .58} ${y - s * .38} ${x + s * .42} ${y + s * .05} ${x + s * .08} ${y + s * .1} C${x + s * .26} ${y - s * .06} ${x + s * .28} ${y - s * .26} ${x + s * .12} ${y - s * .5} Z" fill="${c2}" opacity=".3" stroke="#fff" stroke-width="6"/></g>`;
    case 'storm':
    case 'bolt':
      return `<g filter="url(#${id}-shadow)"><polygon points="${x + s * .12},${y - s * .56} ${x - s * .34},${y + s * .08} ${x - s * .04},${y + s * .08} ${x - s * .18},${y + s * .56} ${x + s * .36},${y - s * .14} ${x + s * .06},${y - s * .14}" fill="${c}" stroke="#fff" stroke-width="6"/></g>`;
    case 'hammer':
      return `<g filter="url(#${id}-shadow)"><rect x="${x - s * .42}" y="${y - s * .46}" width="${s * .72}" height="${s * .28}" rx="${s * .08}" fill="${c}" stroke="#fff" stroke-width="6"/><path d="M${x + s * .02} ${y - s * .2} L${x + s * .34} ${y + s * .48}" stroke="${c2}" stroke-width="16"/><circle cx="${x + s * .39}" cy="${y + s * .54}" r="${s * .08}" fill="${c}"/></g>`;
    case 'flame':
      return `<g filter="url(#${id}-shadow)"><path d="M${x} ${y + s * .55} C${x - s * .5} ${y + s * .1} ${x - s * .12} ${y - s * .22} ${x - s * .06} ${y - s * .55} C${x + s * .32} ${y - s * .2} ${x + s * .52} ${y + s * .1} ${x} ${y + s * .55} Z" fill="${g}" stroke="${c}" stroke-width="7"/><path d="M${x} ${y + s * .35} C${x - s * .16} ${y + s * .08} ${x} ${y - s * .12} ${x + s * .08} ${y - s * .28} C${x + s * .24} ${y} ${x + s * .25} ${y + s * .18} ${x} ${y + s * .35} Z" fill="#fff3a7"/></g>`;
    case 'coin':
      return `<g filter="url(#${id}-shadow)"><circle cx="${x}" cy="${y}" r="${s * .46}" fill="url(#${id}-gold)" stroke="#fff2a8" stroke-width="6"/><circle cx="${x}" cy="${y}" r="${s * .3}" fill="none" stroke="#7c4a03" stroke-width="5"/>${text('$', 58)}</g>`;
    case 'fang':
      return `<g filter="url(#${id}-shadow)"><path d="M${x - s * .26} ${y - s * .48} C${x - s * .48} ${y - s * .02} ${x - s * .22} ${y + s * .38} ${x} ${y + s * .56} C${x + s * .04} ${y + s * .12} ${x + s * .18} ${y - s * .22} ${x - s * .26} ${y - s * .48} Z" fill="#fff7d6" stroke="${c}" stroke-width="7"/><path d="M${x + s * .22} ${y - s * .42} C${x + s * .08} ${y + s * .02} ${x + s * .28} ${y + s * .34} ${x + s * .44} ${y + s * .5}" stroke="#fff7d6" stroke-width="14"/></g>`;
    case 'orb':
    case 'portal':
      return `<g filter="url(#${id}-shadow)"><circle cx="${x}" cy="${y}" r="${s * .43}" fill="${g}" opacity=".3" stroke="${c}" stroke-width="7"/><circle cx="${x}" cy="${y}" r="${s * .25}" fill="none" stroke="${c2}" stroke-width="7"/><path d="M${x - s * .34} ${y} C${x - s * .08} ${y - s * .32} ${x + s * .2} ${y - s * .22} ${x + s * .34} ${y}" fill="none" stroke="#fff" stroke-width="5"/></g>`;
    case 'scale':
      return `<g filter="url(#${id}-shadow)"><path d="M${x} ${y - s * .52} C${x + s * .38} ${y - s * .2} ${x + s * .42} ${y + s * .22} ${x} ${y + s * .54} C${x - s * .42} ${y + s * .2} ${x - s * .36} ${y - s * .22} ${x} ${y - s * .52} Z" fill="${c2}" opacity=".35" stroke="${c}" stroke-width="7"/></g>`;
    case 'dragon':
      return `<g filter="url(#${id}-shadow)"><path d="M${x - s * .5} ${y + s * .25} C${x - s * .22} ${y - s * .34} ${x + s * .34} ${y - s * .44} ${x + s * .46} ${y + s * .08} C${x + s * .18} ${y - s * .04} ${x - s * .06} ${y + s * .14} ${x - s * .2} ${y + s * .45}" fill="none" stroke="${c}" stroke-width="13"/><circle cx="${x + s * .36}" cy="${y - s * .1}" r="${s * .08}" fill="#fff"/></g>`;
    case 'comet':
      return `<g filter="url(#${id}-shadow)"><path d="M${x - s * .5} ${y + s * .16} C${x - s * .12} ${y - s * .12} ${x + s * .08} ${y - s * .18} ${x + s * .35} ${y - s * .4}" stroke="${c2}" stroke-width="10" opacity=".65"/><circle cx="${x + s * .18}" cy="${y - s * .1}" r="${s * .22}" fill="${c}" stroke="#fff" stroke-width="5"/></g>`;
    case 'planet':
      return `<g filter="url(#${id}-shadow)"><circle cx="${x}" cy="${y}" r="${s * .34}" fill="${c2}" opacity=".44" stroke="${c}" stroke-width="7"/><ellipse cx="${x}" cy="${y}" rx="${s * .56}" ry="${s * .16}" fill="none" stroke="#fff" stroke-width="5" transform="rotate(-16 ${x} ${y})"/></g>`;
    case 'crystal':
    case 'emerald':
    case 'relic':
      return `<g filter="url(#${id}-shadow)"><polygon points="${x},${y - s * .54} ${x + s * .38},${y - s * .1} ${x + s * .18},${y + s * .5} ${x - s * .18},${y + s * .5} ${x - s * .38},${y - s * .1}" fill="${c2}" opacity=".44" stroke="${c}" stroke-width="7"/><path d="M${x} ${y - s * .48} L${x} ${y + s * .44}" stroke="#fff" stroke-width="4" opacity=".55"/></g>`;
    case 'nova':
    case 'galaxy':
      return `<g filter="url(#${id}-shadow)"><circle cx="${x}" cy="${y}" r="${s * .14}" fill="#fff"/><path d="M${x} ${y - s * .52} L${x + s * .11} ${y - s * .1} L${x + s * .5} ${y} L${x + s * .11} ${y + s * .1} L${x} ${y + s * .52} L${x - s * .11} ${y + s * .1} L${x - s * .5} ${y} L${x - s * .11} ${y - s * .1} Z" fill="${c}" opacity=".7"/></g>`;
    case 'leaf':
      return `<g filter="url(#${id}-shadow)"><path d="M${x - s * .38} ${y + s * .35} C${x - s * .18} ${y - s * .42} ${x + s * .38} ${y - s * .44} ${x + s * .44} ${y - s * .32} C${x + s * .22} ${y + s * .24} ${x - s * .12} ${y + s * .46} ${x - s * .38} ${y + s * .35} Z" fill="${c2}" opacity=".48" stroke="${c}" stroke-width="7"/><path d="M${x - s * .32} ${y + s * .3} C${x - s * .04} ${y + s * .04} ${x + s * .16} ${y - s * .12} ${x + s * .36} ${y - s * .3}" stroke="#fff" stroke-width="5"/></g>`;
    case 'idol':
      return `<g filter="url(#${id}-shadow)"><rect x="${x - s * .32}" y="${y - s * .42}" width="${s * .64}" height="${s * .82}" rx="${s * .14}" fill="${c}" opacity=".22" stroke="${c2}" stroke-width="7"/><circle cx="${x - s * .13}" cy="${y - s * .13}" r="${s * .06}" fill="#fff"/><circle cx="${x + s * .13}" cy="${y - s * .13}" r="${s * .06}" fill="#fff"/><path d="M${x - s * .18} ${y + s * .12} Q${x} ${y + s * .24} ${x + s * .18} ${y + s * .12}" fill="none" stroke="${c2}" stroke-width="6"/></g>`;
    case 'mask':
      return `<g filter="url(#${id}-shadow)"><path d="M${x - s * .42} ${y - s * .34} L${x + s * .42} ${y - s * .34} L${x + s * .26} ${y + s * .42} L${x} ${y + s * .54} L${x - s * .26} ${y + s * .42} Z" fill="${c}" opacity=".22" stroke="${c2}" stroke-width="7"/><path d="M${x - s * .24} ${y - s * .06} L${x - s * .05} ${y + s * .02} M${x + s * .24} ${y - s * .06} L${x + s * .05} ${y + s * .02}" stroke="#fff" stroke-width="6"/></g>`;
    case 'serpent':
      return `<g filter="url(#${id}-shadow)"><path d="M${x - s * .42} ${y + s * .32} C${x - s * .1} ${y - s * .44} ${x + s * .32} ${y + s * .18} ${x - s * .08} ${y + s * .02} C${x - s * .36} ${y - s * .08} ${x + s * .02} ${y - s * .48} ${x + s * .36} ${y - s * .16}" fill="none" stroke="${c}" stroke-width="12"/><circle cx="${x + s * .38}" cy="${y - s * .16}" r="${s * .09}" fill="${c2}"/></g>`;
    case 'rose':
      return `<g filter="url(#${id}-shadow)"><circle cx="${x}" cy="${y - s * .12}" r="${s * .24}" fill="${g}" stroke="${c}" stroke-width="7"/><path d="M${x} ${y + s * .12} L${x} ${y + s * .52}" stroke="${c2}" stroke-width="8"/><path d="M${x} ${y + s * .25} C${x - s * .28} ${y + s * .16} ${x - s * .32} ${y + s * .4} ${x - s * .1} ${y + s * .42}" fill="none" stroke="${c2}" stroke-width="6"/></g>`;
    case 'candle':
      return `<g filter="url(#${id}-shadow)"><rect x="${x - s * .16}" y="${y - s * .08}" width="${s * .32}" height="${s * .54}" rx="${s * .08}" fill="#fff7d6" stroke="${c}" stroke-width="6"/><path d="M${x} ${y - s * .52} C${x + s * .24} ${y - s * .24} ${x + s * .03} ${y - s * .08} ${x} ${y - s * .02} C${x - s * .18} ${y - s * .18} ${x - s * .05} ${y - s * .34} ${x} ${y - s * .52} Z" fill="${c}"/></g>`;
    case 'raven':
      return `<g filter="url(#${id}-shadow)"><path d="M${x - s * .48} ${y + s * .08} C${x - s * .08} ${y - s * .44} ${x + s * .38} ${y - s * .24} ${x + s * .48} ${y + s * .1} C${x + s * .14} ${y - s * .02} ${x - s * .1} ${y + s * .08} ${x - s * .36} ${y + s * .38}" fill="${c2}" opacity=".38" stroke="${c}" stroke-width="7"/><circle cx="${x + s * .2}" cy="${y - s * .1}" r="${s * .05}" fill="#fff"/></g>`;
    case 'goblet':
      return `<g filter="url(#${id}-shadow)"><path d="M${x - s * .34} ${y - s * .42} H${x + s * .34} C${x + s * .28} ${y + s * .02} ${x + s * .1} ${y + s * .2} ${x} ${y + s * .22} C${x - s * .1} ${y + s * .2} ${x - s * .28} ${y + s * .02} ${x - s * .34} ${y - s * .42} Z" fill="${g}" opacity=".3" stroke="${c}" stroke-width="7"/><path d="M${x} ${y + s * .22} V${y + s * .48} M${x - s * .22} ${y + s * .5} H${x + s * .22}" stroke="#fff" stroke-width="6"/></g>`;
    case 'moon':
      return `<g filter="url(#${id}-shadow)"><path d="M${x + s * .18} ${y - s * .48} C${x - s * .28} ${y - s * .34} ${x - s * .32} ${y + s * .28} ${x + s * .1} ${y + s * .48} C${x - s * .48} ${y + s * .5} ${x - s * .58} ${y - s * .34} ${x + s * .18} ${y - s * .48} Z" fill="${c}" opacity=".75"/></g>`;
    case 'castle':
      return `<g filter="url(#${id}-shadow)"><path d="M${x - s * .42} ${y + s * .46} V${y - s * .24} H${x - s * .22} V${y - s * .44} H${x - s * .02} V${y - s * .2} H${x + s * .18} V${y - s * .44} H${x + s * .38} V${y + s * .46} Z" fill="${c2}" opacity=".34" stroke="${c}" stroke-width="7"/><rect x="${x - s * .08}" y="${y + s * .1}" width="${s * .16}" height="${s * .36}" rx="${s * .07}" fill="#020617"/></g>`;
    default:
      return text('★');
  }
}

for (const theme of themes) {
  writeAsset(theme, 'cover.svg', coverSvg(theme));
  writeAsset(theme, 'background.svg', backgroundSvg(theme));
  writeAsset(theme, 'symbols.svg', symbolsSvg(theme));
}

console.log(`Generated ${themes.length * 3} mega slot SVG assets in ${root}`);

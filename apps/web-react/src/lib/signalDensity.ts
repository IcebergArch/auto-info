/* 信号密度处理层（纯函数，前端独立，不依赖后端）
 * 三项能力：
 *  1) 去套话 + 去标题回声：cleanDesc()
 *  2) 近似重复折叠：dedupeSignals()
 *  3) 信息密度评分：scoreDensity()
 *
 * 设计原则：只做"减负"——过滤/折叠/评分，不改写语义、不伪造内容。
 * 后端已在 presentEventForReport 做主力清洗，这里是呈现层的轻量兜底与聚合。
 */

/** 常见模板/套话句式：命中即视为低信息密度，desc 中应剔除或整体判废 */
const FLUFF_PATTERNS: RegExp[] = [
  /建议点击\s*↗?\s*查看英文原文/,
  /出现值得跟踪的重要信息/,
  /围绕「[^」]+」[：:]?出现值得跟踪/,
  /详情以原文为准/,
  /核心数据与措辞以原文为准/,
  /属[^，。]*相关动态$/,
  /涉及地缘冲突或安全局势/,
  /议题线索[：:]/,
  /点开\s*↗?\s*查看(文档)?(正文|完整内容)/,
  /请点\s*↗/,
  /相关报道$/
];

/** 跳转/尾注类后缀，展示层无意义，剔除 */
const TRAILING_NOISE: RegExp[] = [
  /[；;]\s*(详情|全文|原文)[^。；;]*$/,
  /[（(]?点[开击][^）)。]*[）)]?\s*$/
];

export function isFluff(text: string): boolean {
  const v = String(text || "").trim();
  if (!v) return true;
  return FLUFF_PATTERNS.some((re) => re.test(v));
}

function stripTrailingNoise(text: string): string {
  let v = text;
  for (const re of TRAILING_NOISE) v = v.replace(re, "").trim();
  return v;
}

/** 归一化：去标点/空白/大小写，用于标题回声与近似重复比较 */
export function normalizeForCompare(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[，。、；：「」『』""''（）()[\]【】<>《》!！?？.,:;"'`~\-—–|/\\]+/g, "");
}

/**
 * 清洗摘要：剔除套话、尾注噪声；若摘要只是标题的回声，则返回增量部分或空串。
 * @returns 清洗后的 desc；无有效增量信息时返回 ""。
 */
export function cleanDesc(title: string, desc: string): string {
  let v = stripTrailingNoise(String(desc || "").trim());
  if (!v || isFluff(v)) return "";

  const nt = normalizeForCompare(title);
  const nd = normalizeForCompare(v);
  if (!nd) return "";

  // 完全包含关系：desc 被标题覆盖 → 无增量
  if (nt && (nt.includes(nd) || nd === nt)) return "";

  // desc 以标题开头（回声前缀）：尝试取增量尾部
  if (nt && nt.length >= 6 && nd.startsWith(nt)) {
    // 在原始（未归一化）desc 上按字符长度近似切出尾部
    const ratio = nt.length / nd.length;
    const cut = Math.floor(v.length * ratio);
    const tail = v.slice(cut).replace(/^[，。、；：:,.\s]+/, "").trim();
    if (tail.length >= 8 && !isFluff(tail)) return tail;
    return "";
  }

  return v;
}

/** 信息密度评分：高密度锚点加分，套话/过短减分。范围约 0-100。 */
export function scoreDensity(title: string, desc: string): number {
  const corpus = `${title || ""} ${desc || ""}`;
  let score = 30; // 基线

  // 高密度锚点
  if (/\d/.test(corpus)) score += 10; // 含数字
  if (/[$￥€£%]|百分|个基点|亿|万亿|万元|美元|欧元/.test(corpus)) score += 16; // 金额/百分比
  if (/\d{4}\s*年|\d+\s*月|\d+\s*日|季度|Q[1-4]/.test(corpus)) score += 8; // 时间锚
  // 专有机构/实体（中文机构名或连续大写英文）
  if (/(央行|美联储|欧洲央行|能源署|部|委员会|公司|集团|大学|研究所)/.test(corpus)) score += 8;
  if (/\b[A-Z][A-Za-z]{2,}(?:\s+[A-Z][A-Za-z]{2,})?\b/.test(corpus)) score += 4;

  // 动作/因果词（信息更具可判断性）
  if (/(宣布|加息|降息|投资|超越|警示|发布|签署|起诉|裁员|收购|融资|涨|跌|突破)/.test(corpus)) score += 10;

  // desc 有效长度（实质内容）
  const descLen = String(desc || "").trim().length;
  if (descLen >= 24) score += 8;
  else if (descLen === 0) score -= 10;

  // 套话惩罚
  if (isFluff(desc) || isFluff(title)) score -= 25;

  return Math.max(0, Math.min(100, score));
}

type DedupeInput = {
  id: string;
  title: string;
  severity?: number;
};

export type DedupeResult<T extends DedupeInput> = {
  /** 折叠后的代表信号（保留每组冲击最高者） */
  kept: T;
  /** 被折叠掉的近似重复条数（不含代表自身） */
  dupCount: number;
}[];

/** 两个归一化标题的近似度（基于较短串的字符覆盖 + 前缀），返回 0-1。 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.includes(short) && short.length >= 6) return 0.95;
  // 双字 gram 交集占比
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(short);
  const gb = grams(long);
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  ga.forEach((g) => {
    if (gb.has(g)) inter += 1;
  });
  return inter / ga.size;
}

const SIM_THRESHOLD = 0.7;

/**
 * 近似重复折叠：把标题高度相似的信号聚为一组，保留冲击最高者为代表，
 * 记录该组被折叠的重复条数。保持输入顺序（以代表首次出现位置为准）。
 */
export function dedupeSignals<T extends DedupeInput>(signals: T[]): DedupeResult<T> {
  const groups: { rep: T; members: T[]; norm: string }[] = [];

  for (const sig of signals) {
    const norm = normalizeForCompare(sig.title);
    let matched: (typeof groups)[number] | undefined;
    for (const g of groups) {
      if (similarity(norm, g.norm) >= SIM_THRESHOLD) {
        matched = g;
        break;
      }
    }
    if (matched) {
      matched.members.push(sig);
      // 代表取冲击更高者
      if ((sig.severity || 0) > (matched.rep.severity || 0)) {
        matched.rep = sig;
        matched.norm = norm;
      }
    } else {
      groups.push({ rep: sig, members: [sig], norm });
    }
  }

  return groups.map((g) => ({ kept: g.rep, dupCount: g.members.length - 1 }));
}

/**
 * 中文本地化：漫画标题/简介在入库前统一转成中文。
 *
 * 多层策略（逐层降级，任一层成功即止）：
 *  1) MangaDex 中文备选（title.zh / altTitles[].zh / description.zh）——质量最高，无需任何 Key；
 *  2) LLM 批量翻译（OpenAI 兼容接口，环境变量 COMIC_TRANSLATE_* 或 OPENAI_*）——配置了 Key 才启用；
 *  3) Google 免费翻译（free-google-translator-api）——无需 Key；
 *  4) MyMemory 免费翻译——无需 Key，兜底。
 * 全部失败时保留原文，不影响抓取/入库流程。
 */

const CJK_RE = /[\u4e00-\u9fff]/;

/** 是否已是中文（含汉字即视为中文） */
export function isChinese(text: string): boolean {
  return CJK_RE.test(text || '');
}

/** 从 MangaDex title / altTitles 中挑中文标题（无则空串） */
export function pickZhTitle(attr: any): string {
  const t = attr?.title || {};
  for (const k of ['zh', 'zh-hk', 'zh-tw']) {
    if (t[k]) return String(t[k]);
  }
  for (const a of attr?.altTitles || []) {
    for (const k of ['zh', 'zh-hk', 'zh-tw']) {
      if (a?.[k]) return String(a[k]);
    }
  }
  return '';
}

/** 从 MangaDex description 中挑中文简介（无则空串） */
export function pickZhDesc(attr: any): string {
  const d = attr?.description || {};
  for (const k of ['zh', 'zh-hk', 'zh-tw']) {
    if (d[k]) return String(d[k]);
  }
  return '';
}

interface TranslateConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function translateConfig(): TranslateConfig | null {
  const apiKey = process.env.COMIC_TRANSLATE_API_KEY || process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;
  const baseUrl = (
    process.env.COMIC_TRANSLATE_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '');
  const model = process.env.COMIC_TRANSLATE_MODEL || process.env.COMIC_LLM_MODEL || 'gpt-4o-mini';
  return { apiKey, baseUrl, model };
}

/** 是否配置了 LLM 翻译（未配置时自动使用免费翻译源） */
export function isTranslateConfigured(): boolean {
  return translateConfig() !== null;
}

const cache = new Map<string, string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stripFence(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/* ------------------------------------------------------------------ */
/* 免费翻译源 1：Google（free-google-translator-api）                    */
/* ------------------------------------------------------------------ */

// 连续失败计数：网络不通（如 Google 被墙）时快速熔断，避免每次调用都干等超时
let googleFailures = 0;
const GOOGLE_MAX_FAILURES = 3;

/** Promise 超时竞速（该包内部 axios 未设超时，这里兜底） */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error('google translate timeout')), ms);
      t.unref?.();
    }),
  ]);
}

/** Google 英→中；不可用/失败返回空串（由调用方降级到下一个源） */
async function translateViaGoogle(text: string): Promise<string> {
  if (!text || googleFailures >= GOOGLE_MAX_FAILURES) return '';
  // 该包失败时会 console.error("Error translating text:", errorObj)（网络不通时非常刷屏），
  // 这里只精确抑制它自己的 axios 错误，其它日志照常输出。
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const isPackageError = args.some((a) => {
      const e = a as { isAxiosError?: boolean; stack?: string } | undefined;
      return !!e && (e.isAxiosError === true || (typeof e.stack === 'string' && e.stack.includes('free-google-translator-api')));
    });
    if (isPackageError) return;
    origError(...(args as []));
  };
  try {
    // 懒加载：依赖缺失不影响服务启动与其它翻译源
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const googleTranslate = require('free-google-translator-api') as (
      s: string,
      from: string,
      to: string,
    ) => Promise<string>;
    // 该包复用共享 axios 默认实例且未设超时，补一个默认超时防止挂起
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axios = require('axios') as { defaults: { timeout?: number } };
    if (!axios.defaults.timeout) axios.defaults.timeout = 12000;

    const out = await withTimeout(googleTranslate(text, 'en', 'zh-CN'), 15000);
    googleFailures = 0;
    return isChinese(out) ? out : '';
  } catch {
    googleFailures += 1;
    return '';
  } finally {
    console.error = origError;
  }
}

/* ------------------------------------------------------------------ */
/* 免费翻译源 2：MyMemory                                               */
/* ------------------------------------------------------------------ */

/** MyMemory 英→中；配额用尽/失败返回空串 */
async function translateViaMyMemory(text: string): Promise<string> {
  if (!text) return '';
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`,
      { headers: { 'User-Agent': 'ZhenjianComic/1.0' }, signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return '';
    const j: any = await res.json();
    const tr = String(j?.responseData?.translatedText || '').trim();
    // 配额用尽时 MyMemory 会回显警告，只接受中文译文
    if (tr && isChinese(tr) && !/MYMEMORY WARNING/i.test(tr)) return tr;
  } catch {
    /* 失败：返回空串 */
  }
  return '';
}

/** 免费翻译：Google 优先，MyMemory 兜底 */
async function translateViaFreeSources(texts: string[]): Promise<string[]> {
  const out = [...texts];
  for (let i = 0; i < texts.length; i += 1) {
    if (!texts[i]) continue;
    const g = await translateViaGoogle(texts[i]);
    if (g) {
      out[i] = g;
      cache.set(texts[i], g);
      continue;
    }
    const m = await translateViaMyMemory(texts[i]);
    if (m) {
      out[i] = m;
      cache.set(texts[i], m);
    }
    await sleep(150); // 限流
  }
  return out;
}

/**
 * 批量把非中文文本翻译成简体中文。
 * 已是中文 / 空 / 已缓存的项原样透传；所有翻译源都失败时保留原文（不中断调用方流程）。
 */
export async function translateToZh(texts: string[], kind: 'title' | 'description'): Promise<string[]> {
  const out = [...texts];
  const c = translateConfig();
  const pending: number[] = [];
  texts.forEach((t, i) => {
    if (!t || isChinese(t)) return;
    const hit = cache.get(t);
    if (hit !== undefined) out[i] = hit;
    else pending.push(i);
  });
  if (!pending.length) return out;

  // 第二层：LLM（配置了 Key 才走）
  if (c) {
    const sys =
      kind === 'title'
        ? '你是漫画标题翻译引擎。把 JSON 数组中的每个漫画标题翻译成简体中文，采用官方或通用中文译名。严格只输出 JSON 字符串数组，长度与输入一致，不要输出任何其他内容。'
        : '你是漫画简介翻译引擎。把 JSON 数组中的每段漫画简介翻译成流畅的简体中文，保留原意与专有名词，不增删信息。严格只输出 JSON 字符串数组，长度与输入一致，不要输出任何其他内容。';

    for (let s = 0; s < pending.length; s += 8) {
      const chunk = pending.slice(s, s + 8);
      const payload = chunk.map((i) => texts[i]);
      try {
        const res = await fetch(`${c.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
          body: JSON.stringify({
            model: c.model,
            temperature: 0.2,
            messages: [
              { role: 'system', content: sys },
              { role: 'user', content: JSON.stringify(payload) },
            ],
          }),
        });
        if (!res.ok) continue;
        const data: any = await res.json();
        const arr = JSON.parse(stripFence(String(data.choices?.[0]?.message?.content || '')));
        if (!Array.isArray(arr) || arr.length !== chunk.length) continue;
        chunk.forEach((idx, j) => {
          const v = String(arr[j] ?? '').trim();
          // 只接受中文译文，避免把失败结果（如原文回显）写进库
          if (v && isChinese(v)) {
            out[idx] = v;
            cache.set(texts[idx], v);
          }
        });
      } catch {
        /* 单批失败：进入免费源兜底 */
      }
    }
  }

  // 第三层：免费翻译源（Google → MyMemory）
  const still = pending.filter((i) => out[i] === texts[i]);
  if (still.length) {
    const free = await translateViaFreeSources(still.map((i) => texts[i]));
    still.forEach((idx, j) => {
      if (free[j] !== texts[idx]) out[idx] = free[j];
    });
  }
  return out;
}

export interface LocalizedComic {
  title: string;
  description: string;
  /** 实际发生了翻译的条数（0 = 原本就是中文或翻译源均失败） */
  translated: number;
}

/**
 * 本地化一部漫画的标题/简介。
 * 调用方应先把 MangaDex 中文备选（pickZhTitle / pickZhDesc）作为入参传入，
 * 本函数只负责把仍是非中文的文本交给翻译源（LLM / Google / MyMemory）。
 */
export async function localizeComic(title: string, description: string): Promise<LocalizedComic> {
  const [nt] = await translateToZh([title || ''], 'title');
  const [nd] = await translateToZh([description || ''], 'description');
  return {
    title: nt,
    description: nd,
    translated: (nt !== title ? 1 : 0) + (nd !== description ? 1 : 0),
  };
}

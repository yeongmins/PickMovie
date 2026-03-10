const SITE_NAME = "PickMovie";
const SITE_URL = "https://pickmovie.net";
const DEFAULT_OG_IMAGE = `${SITE_URL}/pickmovie-og.png`;
const DEFAULT_OG_IMAGE_ALT = "PickMovie(픽무비) 영화 및 TV 추천 서비스";
const DEFAULT_DESCRIPTION =
  "PickMovie(픽무비)는 취향 분석 기반으로 영화와 TV 콘텐츠를 추천해주는 맞춤형 추천 서비스입니다.";

type JsonLd = Record<string, unknown>;

export type SeoPayload = {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  keywords?: string;
  robots?: string;
  type?: "website" | "article" | "profile";
  jsonLd?: JsonLd | JsonLd[];
};

function ensureMeta(nameOrProperty: "name" | "property", key: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${nameOrProperty}="${key}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(nameOrProperty, key);
    document.head.appendChild(el);
  }
  return el;
}

function ensureCanonical() {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  return link;
}

function ensureAlternate(lang: "ko-KR" | "x-default") {
  let link = document.head.querySelector<HTMLLinkElement>(
    `link[rel="alternate"][hreflang="${lang}"]`,
  );
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "alternate");
    link.setAttribute("hreflang", lang);
    document.head.appendChild(link);
  }
  return link;
}

function toAbsoluteUrl(path?: string) {
  if (!path || !path.trim()) return `${SITE_URL}/`;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function upsertJsonLd(value?: JsonLd | JsonLd[]) {
  const id = "pickmovie-jsonld";
  const prev = document.getElementById(id);
  if (prev) prev.remove();
  if (!value) return;

  const list = Array.isArray(value) ? value : [value];
  if (!list.length) return;

  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.text = JSON.stringify(list.length === 1 ? list[0] : list);
  document.head.appendChild(script);
}

export function applySeo(payload: SeoPayload) {
  if (typeof document === "undefined") return;

  const description = (payload.description || DEFAULT_DESCRIPTION).trim();
  const canonical = toAbsoluteUrl(payload.path);
  const image = toAbsoluteUrl(payload.image || DEFAULT_OG_IMAGE);
  const robots = payload.robots || "index,follow,max-image-preview:large";
  const type = payload.type || "website";

  document.title = payload.title;

  ensureMeta("name", "description").setAttribute("content", description);
  ensureMeta("name", "robots").setAttribute("content", robots);
  ensureMeta("name", "googlebot").setAttribute("content", robots);
  ensureMeta("name", "bingbot").setAttribute("content", robots);
  ensureMeta("name", "Yeti").setAttribute("content", robots);
  ensureMeta("name", "NaverBot").setAttribute("content", robots);
  if (payload.keywords?.trim()) {
    ensureMeta("name", "keywords").setAttribute("content", payload.keywords.trim());
  }

  ensureMeta("property", "og:site_name").setAttribute("content", SITE_NAME);
  ensureMeta("property", "og:locale").setAttribute("content", "ko_KR");
  ensureMeta("property", "og:type").setAttribute("content", type);
  ensureMeta("property", "og:title").setAttribute("content", payload.title);
  ensureMeta("property", "og:description").setAttribute("content", description);
  ensureMeta("property", "og:url").setAttribute("content", canonical);
  ensureMeta("property", "og:image").setAttribute("content", image);
  ensureMeta("property", "og:image:alt").setAttribute(
    "content",
    DEFAULT_OG_IMAGE_ALT,
  );

  ensureMeta("name", "twitter:card").setAttribute("content", "summary_large_image");
  ensureMeta("name", "twitter:site").setAttribute("content", "@pickmovie");
  ensureMeta("name", "twitter:title").setAttribute("content", payload.title);
  ensureMeta("name", "twitter:description").setAttribute("content", description);
  ensureMeta("name", "twitter:image").setAttribute("content", image);
  ensureMeta("name", "twitter:image:alt").setAttribute(
    "content",
    DEFAULT_OG_IMAGE_ALT,
  );

  ensureCanonical().setAttribute("href", canonical);
  ensureAlternate("ko-KR").setAttribute("href", canonical);
  ensureAlternate("x-default").setAttribute("href", canonical);
  upsertJsonLd(payload.jsonLd);
}

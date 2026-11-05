/**
 * Уровень детализации моделей и окружения: 1 — слабые телефоны («низкая»),
 * 2 — обычные телефоны («высокая»), 3 — ПК («ультра»). Задаётся до постройки сцен
 * и моделей; новые модели и карты строятся уже с новым уровнем.
 */
export const DETAIL = { level: 2 as 1 | 2 | 3 };

/** Множитель сегментов геометрии: модели героев, мобов, оружия — глаже на высоких уровнях. */
const SEG = [1, 1, 1.5, 2];
/** Множитель количества мелочей окружения: трава, цветы, камешки, листва. */
const COUNT = [1, 1.3, 2.2, 3];

export const seg = (n: number) => Math.max(3, Math.round(n * SEG[DETAIL.level]));
export const count = (n: number) => Math.round(n * COUNT[DETAIL.level]);

export function setDetail(q: 'low' | 'high' | 'ultra') {
  DETAIL.level = q === 'low' ? 1 : q === 'high' ? 2 : 3;
}

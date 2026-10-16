export const CATEGORIES = [
  '热血', '恋爱', '玄幻', '修真', '悬疑', '搞笑', '校园', '科幻',
  '古风', '甜宠', '冒险', '奇幻', '竞技', '治愈', '日常', '都市',
  '推理', '运动', '战斗', '青春',
] as const;

export const REGIONS = ['国漫', '日漫', '韩漫', '美漫', '其他'] as const;

export const STATUSES = ['连载', '完结'] as const;

export const SHELF_STATUS = ['want', 'following', 'finished', 'dropped'] as const;

export type ShelfStatus = (typeof SHELF_STATUS)[number];

export const SHELF_STATUS_TEXT: Record<ShelfStatus, string> = {
  want: '想读',
  following: '追更中',
  finished: '已看完',
  dropped: '搁置',
};

export const HOT_KEYWORDS = [
  '剑歌', '恋爱', '玄幻', '逆袭', '热血', '悬疑', '校园', '修真',
  '甜宠', '末日', '侦探', '电竞',
];

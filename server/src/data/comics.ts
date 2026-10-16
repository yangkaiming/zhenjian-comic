export interface SeedComic {
  title: string;
  author: string;
  region: string;
  status: string;
  categories: string[];
  tags: string[];
  description: string;
  rating: number;
  views: number;
  chapterCount: number;
  recommend: number;
}

export const SEED_COMICS: SeedComic[] = [
  {
    title: '九霄剑歌', author: '墨白', region: '国漫', status: '连载',
    categories: ['热血', '玄幻'], tags: ['剑修', '宗门', '逆袭'],
    description: '少年执一柄断剑自边城而出，斩尽九霄不正之徒。三十七宗门的旧账，从今日开始清算。',
    rating: 9.3, views: 1284000, chapterCount: 68, recommend: 98,
  },
  {
    title: '山海秘闻录', author: '青丘客', region: '国漫', status: '连载',
    categories: ['冒险', '奇幻'], tags: ['妖兽', '地图', '组队'],
    description: '一本残破的山海图，藏着失踪十年的父亲留下的最后线索。',
    rating: 8.9, views: 862000, chapterCount: 54, recommend: 90,
  },
  {
    title: '长安幻夜', author: '苏小楼', region: '国漫', status: '完结',
    categories: ['古风', '悬疑'], tags: ['唐风', '志怪', '探案'],
    description: '上元灯会那夜，长安城丢了三十七个影子。大理寺少卿决定亲自去问问鬼神。',
    rating: 9.5, views: 1520000, chapterCount: 42, recommend: 95,
  },
  {
    title: '医道通天', author: '陈皮', region: '国漫', status: '连载',
    categories: ['都市', '修真'], tags: ['神医', '都市', '打脸'],
    description: '一针定生死，一丹换天命。回城的实习医生，口袋里只有三根银针。',
    rating: 8.4, views: 743000, chapterCount: 96, recommend: 72,
  },
  {
    title: '我的师姐是魔尊', author: '沐九', region: '国漫', status: '连载',
    categories: ['搞笑', '修真'], tags: ['师姐', '反差', '沙雕'],
    description: '入门第一天，师父让我离师姐远一点。第三天，师姐把整个魔教灭了。',
    rating: 9.0, views: 998000, chapterCount: 61, recommend: 88,
  },
  {
    title: '深空征途', author: '星野', region: '国漫', status: '连载',
    categories: ['科幻', '热血'], tags: ['星际', '机甲', '远征'],
    description: '人类第四舰队失联的第七年，一台老式机甲重新点火。',
    rating: 9.1, views: 654000, chapterCount: 37, recommend: 85,
  },
  {
    title: '恋爱这件小事', author: '林小满', region: '国漫', status: '完结',
    categories: ['恋爱', '校园'], tags: ['青梅竹马', '甜', '青春'],
    description: '他把情书塞进她的物理练习册，第二天被老师当众朗读。',
    rating: 8.8, views: 1120000, chapterCount: 32, recommend: 80,
  },
  {
    title: '逆光少年', author: '阿澈', region: '国漫', status: '连载',
    categories: ['青春', '日常'], tags: ['成长', '摄影', '治愈'],
    description: '一台坏掉的胶片机，记录了十七岁那年所有逆着光的瞬间。',
    rating: 8.6, views: 421000, chapterCount: 28, recommend: 66,
  },
  {
    title: '龙渊战纪', author: '铁舟', region: '国漫', status: '连载',
    categories: ['热血', '战斗'], tags: ['龙族', '战场', '兄弟'],
    description: '城墙之上，最后一个持旗人没有倒下，因为身后是他全部的兄弟。',
    rating: 8.7, views: 587000, chapterCount: 73, recommend: 78,
  },
  {
    title: '妖怪茶话会', author: '糖不甜', region: '国漫', status: '连载',
    categories: ['治愈', '奇幻'], tags: ['妖怪', '日常', '暖'],
    description: '每周三晚上，巷尾的茶馆只对非人类营业，老板是个不太熟练的人类。',
    rating: 9.2, views: 512000, chapterCount: 45, recommend: 84,
  },
  {
    title: '社畜生存指南', author: '阿栗', region: '国漫', status: '连载',
    categories: ['搞笑', '日常'], tags: ['职场', '吐槽', '条漫'],
    description: '入职第一天，我在工位抽屉里发现了一本前任留下的逃生手册。',
    rating: 9.4, views: 1670000, chapterCount: 120, recommend: 96,
  },
  {
    title: '猫猫咖啡馆', author: '喵酱', region: '国漫', status: '连载',
    categories: ['治愈', '日常'], tags: ['猫', '咖啡', '轻松'],
    description: '店长是只三花猫，它比任何人都更懂得安慰加班到深夜的客人。',
    rating: 9.3, views: 935000, chapterCount: 88, recommend: 92,
  },
  {
    title: '学霸追妻计划', author: '甜橙', region: '国漫', status: '完结',
    categories: ['甜宠', '校园'], tags: ['学霸', '甜', '双向奔赴'],
    description: '年级第一列了一份二十页的计划表，标题是：如何让她也喜欢我。',
    rating: 8.9, views: 1240000, chapterCount: 36, recommend: 82,
  },
  {
    title: '深海之下', author: '蓝鲸', region: '国漫', status: '连载',
    categories: ['悬疑', '科幻'], tags: ['深海', '探险', '未知'],
    description: '探测器在马里亚纳以下四千米，收到了一段有规律的人类摩斯电码。',
    rating: 8.8, views: 476000, chapterCount: 41, recommend: 70,
  },
  {
    title: '电竞奶妈', author: '柚子茶', region: '国漫', status: '连载',
    categories: ['竞技', '恋爱'], tags: ['电竞', '辅助', '甜'],
    description: '全服第一辅助，是个只肯给别人加血、不肯给自己加的笨蛋。',
    rating: 9.0, views: 1083000, chapterCount: 57, recommend: 87,
  },
  {
    title: '修仙不如跳舞', author: '舞林', region: '国漫', status: '连载',
    categories: ['搞笑', '修真'], tags: ['沙雕', '宗门', '整活'],
    description: '宗门大比当天，我方代表在擂台上跳了一支极乐净土。',
    rating: 9.1, views: 823000, chapterCount: 64, recommend: 89,
  },
  {
    title: '长安十二时辰录', author: '未央', region: '国漫', status: '完结',
    categories: ['古风', '悬疑'], tags: ['唐风', '限时', '推理'],
    description: '十二个时辰内找出那枚失窃的鱼符，否则整座长安将在黎明前燃起大火。',
    rating: 9.2, views: 1380000, chapterCount: 48, recommend: 93,
  },
  {
    title: '星海拾荒者', author: '柯蓝', region: '国漫', status: '连载',
    categories: ['科幻', '冒险'], tags: ['废土', '星际', '拾荒'],
    description: '在垃圾星带里捡到一艘还能动的飞船，是幸运还是麻烦的开始。',
    rating: 8.5, views: 396000, chapterCount: 33, recommend: 62,
  },
  {
    title: '樱色方程式', author: '藤原理惠', region: '日漫', status: '完结',
    categories: ['恋爱', '校园'], tags: ['纯爱', '理科', '樱花'],
    description: '她把告白写成了数学证明题，最后一步留给他来解。',
    rating: 9.0, views: 1450000, chapterCount: 40, recommend: 91,
  },
  {
    title: '剑与黄昏', author: '黑木凉', region: '日漫', status: '连载',
    categories: ['热血', '奇幻'], tags: ['剑士', '末世', '宿命'],
    description: '黄昏降临之后，世界上只剩下两种人：拔剑的，和等死的。',
    rating: 9.3, views: 1760000, chapterCount: 82, recommend: 97,
  },
  {
    title: '深夜食堂物语', author: '中村灯', region: '日漫', status: '连载',
    categories: ['治愈', '日常'], tags: ['美食', '深夜', '人情'],
    description: '凌晨一点的吧台前，一杯热汤就能换一个不愿说出口的故事。',
    rating: 9.4, views: 1190000, chapterCount: 76, recommend: 94,
  },
  {
    title: '侦探社的第七人', author: '森川瞬', region: '日漫', status: '连载',
    categories: ['悬疑', '推理'], tags: ['本格', '群像', '密室'],
    description: '第七个人加入时，社长说：我们终于可以开始正式的案子了。',
    rating: 9.1, views: 764000, chapterCount: 52, recommend: 86,
  },
  {
    title: '银河快递员', author: '佐藤翼', region: '日漫', status: '完结',
    categories: ['科幻', '冒险'], tags: ['快递', '银河', '公路片'],
    description: '最后一单投递地址写着：收件人，三十年前的我自己。',
    rating: 9.2, views: 683000, chapterCount: 30, recommend: 83,
  },
  {
    title: '排球少年们的夏天', author: '西野刚', region: '日漫', status: '连载',
    categories: ['运动', '热血'], tags: ['排球', '社团', '青春'],
    description: '没有身高、没有天赋，只有不肯落地的那颗球。',
    rating: 9.5, views: 1890000, chapterCount: 90, recommend: 99,
  },
  {
    title: '吸血鬼执事', author: '月宫凛', region: '日漫', status: '连载',
    categories: ['奇幻', '恋爱'], tags: ['吸血鬼', '执事', '契约'],
    description: '签订契约的条件是：每日一杯，不得过量。',
    rating: 8.7, views: 921000, chapterCount: 44, recommend: 76,
  },
  {
    title: '末日列车', author: '高桥彻', region: '日漫', status: '完结',
    categories: ['悬疑', '科幻'], tags: ['末日', '列车', '人性'],
    description: '最后一节车厢的门只能从外面打开，而外面已经没有人类了。',
    rating: 9.0, views: 806000, chapterCount: 38, recommend: 81,
  },
  {
    title: '财阀家的小儿子', author: '金志勋', region: '韩漫', status: '连载',
    categories: ['都市', '热血'], tags: ['重生', '商战', '逆袭'],
    description: '重活一次，他从家族最不受宠的小儿子开始，一步步买下整个集团。',
    rating: 9.2, views: 1330000, chapterCount: 79, recommend: 95,
  },
  {
    title: '重返二十岁', author: '朴书妍', region: '韩漫', status: '连载',
    categories: ['恋爱', '都市'], tags: ['重生', '甜', '职场'],
    description: '一觉醒来回到二十岁的教室，同桌还是那个后来伤她最深的人。',
    rating: 8.8, views: 978000, chapterCount: 63, recommend: 79,
  },
  {
    title: '剑尊归来', author: '李道贤', region: '韩漫', status: '连载',
    categories: ['热血', '玄幻'], tags: ['转世', '剑尊', '复仇'],
    description: '被封印三百年，他醒来时发现自己的剑已经被供在了神庙里。',
    rating: 8.9, views: 1042000, chapterCount: 71, recommend: 85,
  },
  {
    title: '我的室友是恶鬼', author: '郑宥拉', region: '韩漫', status: '完结',
    categories: ['悬疑', '搞笑'], tags: ['合租', '恶鬼', '反差'],
    description: '房租便宜得离谱的原因，是上一个租客只住了一天。',
    rating: 9.0, views: 715000, chapterCount: 34, recommend: 80,
  },
  {
    title: '电竞之王', author: '姜敏浩', region: '韩漫', status: '连载',
    categories: ['竞技', '热血'], tags: ['电竞', '天才', '战队'],
    description: '被战队除名的那天，他在网吧里打上了服务器第一。',
    rating: 9.1, views: 1260000, chapterCount: 58, recommend: 90,
  },
  {
    title: '甜心攻略', author: '韩素音', region: '韩漫', status: '连载',
    categories: ['甜宠', '恋爱'], tags: ['契约恋爱', '霸总', '甜'],
    description: '合同第三条：不得在公开场合牵手。第五条：私下必须牵手。',
    rating: 8.6, views: 889000, chapterCount: 49, recommend: 74,
  },
  {
    title: '星盾联盟', author: '杰克·罗根', region: '美漫', status: '连载',
    categories: ['战斗', '热血'], tags: ['超级英雄', '团队', '拯救'],
    description: '六个人，六块盾牌，一个谁都不想当的领袖位置。',
    rating: 8.3, views: 534000, chapterCount: 46, recommend: 68,
  },
  {
    title: '暗夜追猎者', author: '艾米·沃克', region: '美漫', status: '完结',
    categories: ['悬疑', '战斗'], tags: ['黑暗', '猎杀', '反转'],
    description: '追了十年的那头怪物，最后在镜子里找到了。',
    rating: 8.7, views: 462000, chapterCount: 27, recommend: 64,
  },
  {
    title: '荒原旅人', author: '罗伊斯', region: '美漫', status: '完结',
    categories: ['冒险', '战斗'], tags: ['西部', '公路', '孤独'],
    description: '一条枪、一匹马、一封寄不出去的信，走完最后三百英里。',
    rating: 9.0, views: 398000, chapterCount: 24, recommend: 71,
  },
  {
    title: '钢铁之心', author: '卡尔·邓恩', region: '美漫', status: '连载',
    categories: ['科幻', '动作'], tags: ['机甲', '叛乱', '人工智能'],
    description: '当机甲第一次拒绝执行指令，工程师知道它已经醒了。',
    rating: 8.5, views: 587000, chapterCount: 39, recommend: 73,
  },
];

export const CHAPTER_SUBTITLES = [
  '起程', '相遇', '旧账', '夜雨', '试炼', '抉择', '真相', '突围',
  '重逢', '黎明', '残局', '终章', '风起', '暗涌', '归途',
];

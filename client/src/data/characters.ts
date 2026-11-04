export interface CharacterPreset {
  id: string;
  name: string;
  category: string;
  prompt: string;
  uc?: string;
  isBuiltin?: boolean;
  isFavorite?: boolean;
  updatedAt?: number;
}

export const BUILTIN_PRESETS: CharacterPreset[] = [
  // ==========================================
  // 原有内置角色
  // ==========================================
  {
    id: 'genshin-nahida',
    name: '纳西妲 (Nahida)',
    category: '原神',
    prompt: 'nahida(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-klee',
    name: '可莉 (Klee)',
    category: '原神',
    prompt: 'klee(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-sigewinne',
    name: '希格雯 (Sigewinne)',
    category: '原神',
    prompt: 'sigewinne(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-sigewinne-luckin',
    name: '希格雯·瑞幸联名 (Sigewinne Luckin Coffee)',
    category: '原神',
    prompt: 'sigewinne(luckin coffee)(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kachina',
    name: '卡齐娜 (Kachina)',
    category: '原神',
    prompt: 'kachina(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-diona',
    name: '迪奥娜 (Diona)',
    category: '原神',
    prompt: 'diona(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-qiqi',
    name: '七七 (Qiqi)',
    category: '原神',
    prompt: 'qiqi(genshin impact)',
    isBuiltin: true
  },
  {
    id: 'hsr-bailu',
    name: '白露 (Bailu)',
    category: '崩铁',
    prompt: 'bailu(honkai:starrail)',
    isBuiltin: true
  },
  {
    id: 'hsr-huohuo',
    name: '霍霍 (huohuo)',
    category: '崩铁',
    prompt: 'huohuo(honkai:starrail)',
    isBuiltin: true
  },

  // ==========================================
  // 原神 (Genshin Impact)
  // ==========================================
  // 枫丹 (Fontaine)
  {
    id: 'genshin-furina',
    name: '芙宁娜 (Furina)',
    category: '原神',
    prompt: 'furina (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-neuvillette',
    name: '那维莱特 (Neuvillette)',
    category: '原神',
    prompt: 'neuvillette (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-navia',
    name: '娜维娅 (Navia)',
    category: '原神',
    prompt: 'navia (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-clorinde',
    name: '克洛琳德 (Clorinde)',
    category: '原神',
    prompt: 'clorinde (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-arlecchino',
    name: '阿蕾奇诺 (Arlecchino)',
    category: '原神',
    prompt: 'arlecchino (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-wriothesley',
    name: '莱欧斯利 (Wriothesley)',
    category: '原神',
    prompt: 'wriothesley (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-lyney',
    name: '林尼 (Lyney)',
    category: '原神',
    prompt: 'lyney (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-lynette',
    name: '琳妮特 (Lynette)',
    category: '原神',
    prompt: 'lynette (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-freminet',
    name: '菲米尼 (Freminet)',
    category: '原神',
    prompt: 'freminet (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-chevreuse',
    name: '夏沃蕾 (Chevreuse)',
    category: '原神',
    prompt: 'chevreuse (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-charlotte',
    name: '夏洛蒂 (Charlotte)',
    category: '原神',
    prompt: 'charlotte (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-emilie',
    name: '艾梅莉埃 (Emilie)',
    category: '原神',
    prompt: 'emilie (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-chiori',
    name: '千织 (Chiori)',
    category: '原神',
    prompt: 'chiori (genshin impact)',
    isBuiltin: true
  },

  // 纳塔 (Natlan)
  {
    id: 'genshin-mavuika',
    name: '玛薇卡 (Mavuika)',
    category: '原神',
    prompt: 'mavuika (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-mualani',
    name: '玛拉妮 (Mualani)',
    category: '原神',
    prompt: 'mualani (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kinich',
    name: '基尼奇 (Kinich)',
    category: '原神',
    prompt: 'kinich (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-xilonen',
    name: '希诺宁 (Xilonen)',
    category: '原神',
    prompt: 'xilonen (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-chasca',
    name: '恰斯卡 (Chasca)',
    category: '原神',
    prompt: 'chasca (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-citlali',
    name: '茜特菈莉 (Citlali)',
    category: '原神',
    prompt: 'citlali (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-ororon',
    name: '欧洛伦 (Ororon)',
    category: '原神',
    prompt: 'ororon (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-iansan',
    name: '伊安珊 (Iansan)',
    category: '原神',
    prompt: 'iansan (genshin impact)',
    isBuiltin: true
  },

  // 稻妻 (Inazuma)
  {
    id: 'genshin-raiden-shogun',
    name: '雷电将军 (Raiden Shogun)',
    category: '原神',
    prompt: 'raiden shogun (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-yae-miko',
    name: '八重神子 (Yae Miko)',
    category: '原神',
    prompt: 'yae miko (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kamisato-ayaka',
    name: '神里绫华 (Kamisato Ayaka)',
    category: '原神',
    prompt: 'kamisato ayaka (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kamisato-ayato',
    name: '神里绫人 (Kamisato Ayato)',
    category: '原神',
    prompt: 'kamisato ayato (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kaedehara-kazuha',
    name: '枫原万叶 (Kaedehara Kazuha)',
    category: '原神',
    prompt: 'kaedehara kazuha (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-yoimiya',
    name: '宵宫 (Yoimiya)',
    category: '原神',
    prompt: 'yoimiya (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-sangonomiya-kokomi',
    name: '珊瑚宫心海 (Sangonomiya Kokomi)',
    category: '原神',
    prompt: 'sangonomiya kokomi (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kuki-shinobu',
    name: '久岐忍 (Kuki Shinobu)',
    category: '原神',
    prompt: 'kuki shinobu (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kujou-sara',
    name: '九条裟罗 (Kujou Sara)',
    category: '原神',
    prompt: 'kujou sara (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-arataki-itto',
    name: '荒泷一斗 (Arataki Itto)',
    category: '原神',
    prompt: 'arataki itto (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-sayu',
    name: '早柚 (Sayu)',
    category: '原神',
    prompt: 'sayu (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-thoma',
    name: '托马 (Thoma)',
    category: '原神',
    prompt: 'thoma (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-gorou',
    name: '五郎 (Gorou)',
    category: '原神',
    prompt: 'gorou (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-shikanoin-heizou',
    name: '鹿野院平藏 (Shikanoin Heizou)',
    category: '原神',
    prompt: 'shikanoin heizou (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kirara',
    name: '绮良良 (Kirara)',
    category: '原神',
    prompt: 'kirara (genshin impact)',
    isBuiltin: true
  },

  // 须弥 (Sumeru)
  {
    id: 'genshin-wanderer',
    name: '流浪者 (Wanderer)',
    category: '原神',
    prompt: 'wanderer (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-alhaitham',
    name: '艾尔海森 (Alhaitham)',
    category: '原神',
    prompt: 'alhaitham (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-tighnari',
    name: '提纳里 (Tighnari)',
    category: '原神',
    prompt: 'tighnari (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-cyno',
    name: '赛诺 (Cyno)',
    category: '原神',
    prompt: 'cyno (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-nilou',
    name: '妮露 (Nilou)',
    category: '原神',
    prompt: 'nilou (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-dehya',
    name: '迪希雅 (Dehya)',
    category: '原神',
    prompt: 'dehya (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-faruzan',
    name: '珐露珊 (Faruzan)',
    category: '原神',
    prompt: 'faruzan (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-layla',
    name: '莱依拉 (Layla)',
    category: '原神',
    prompt: 'layla (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-collei',
    name: '柯莱 (Collei)',
    category: '原神',
    prompt: 'collei (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-candace',
    name: '坎蒂丝 (Candace)',
    category: '原神',
    prompt: 'candace (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kaveh',
    name: '卡维 (Kaveh)',
    category: '原神',
    prompt: 'kaveh (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-dori',
    name: '多莉 (Dori)',
    category: '原神',
    prompt: 'dori (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-sethos',
    name: '赛索斯 (Sethos)',
    category: '原神',
    prompt: 'sethos (genshin impact)',
    isBuiltin: true
  },

  // 璃月 (Liyue)
  {
    id: 'genshin-zhongli',
    name: '钟离 (Zhongli)',
    category: '原神',
    prompt: 'zhongli (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-hu-tao',
    name: '胡桃 (Hu Tao)',
    category: '原神',
    prompt: 'hu tao (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-ganyu',
    name: '甘雨 (Ganyu)',
    category: '原神',
    prompt: 'ganyu (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-keqing',
    name: '刻晴 (Keqing)',
    category: '原神',
    prompt: 'keqing (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-shenhe',
    name: '申鹤 (Shenhe)',
    category: '原神',
    prompt: 'shenhe (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-yelan',
    name: '夜兰 (Yelan)',
    category: '原神',
    prompt: 'yelan (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-xiao',
    name: '魈 (Xiao)',
    category: '原神',
    prompt: 'xiao (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-xianyun',
    name: '闲云 (Xianyun)',
    category: '原神',
    prompt: 'xianyun (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-ningguang',
    name: '凝光 (Ningguang)',
    category: '原神',
    prompt: 'ningguang (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-beidou',
    name: '北斗 (Beidou)',
    category: '原神',
    prompt: 'beidou (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-xiangling',
    name: '香菱 (Xiangling)',
    category: '原神',
    prompt: 'xiangling (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-xingqiu',
    name: '行秋 (Xingqiu)',
    category: '原神',
    prompt: 'xingqiu (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-chongyun',
    name: '重云 (Chongyun)',
    category: '原神',
    prompt: 'chongyun (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-yanfei',
    name: '烟绯 (Yanfei)',
    category: '原神',
    prompt: 'yanfei (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-yun-jin',
    name: '云堇 (Yun Jin)',
    category: '原神',
    prompt: 'yun jin (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-xinyan',
    name: '辛焱 (Xinyan)',
    category: '原神',
    prompt: 'xinyan (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-yaoyao',
    name: '瑶瑶 (Yaoyao)',
    category: '原神',
    prompt: 'yaoyao (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-baizhu',
    name: '白术 (Baizhu)',
    category: '原神',
    prompt: 'baizhu (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-gaming',
    name: '嘉明 (Gaming)',
    category: '原神',
    prompt: 'gaming (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-guizhong',
    name: '归终 (Guizhong)',
    category: '原神',
    prompt: 'guizhong (genshin impact)',
    isBuiltin: true
  },

  // 蒙德 (Mondstadt)
  {
    id: 'genshin-venti',
    name: '温迪 (Venti)',
    category: '原神',
    prompt: 'venti (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-eula',
    name: '优菈 (Eula)',
    category: '原神',
    prompt: 'eula (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-jean',
    name: '琴 (Jean)',
    category: '原神',
    prompt: 'jean (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-mona',
    name: '莫娜 (Mona)',
    category: '原神',
    prompt: 'mona (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-barbara',
    name: '芭芭拉 (Barbara)',
    category: '原神',
    prompt: 'barbara (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-lisa',
    name: '丽莎 (Lisa)',
    category: '原神',
    prompt: 'lisa (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-amber',
    name: '安柏 (Amber)',
    category: '原神',
    prompt: 'amber (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-noelle',
    name: '诺艾尔 (Noelle)',
    category: '原神',
    prompt: 'noelle (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-fischl',
    name: '菲谢尔 (Fischl)',
    category: '原神',
    prompt: 'fischl (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-sucrose',
    name: '砂糖 (Sucrose)',
    category: '原神',
    prompt: 'sucrose (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-rosaria',
    name: '罗莎莉亚 (Rosaria)',
    category: '原神',
    prompt: 'rosaria (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-diluc',
    name: '迪卢克 (Diluc)',
    category: '原神',
    prompt: 'diluc (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-kaeya',
    name: '凯亚 (Kaeya)',
    category: '原神',
    prompt: 'kaeya (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-albedo',
    name: '阿贝多 (Albedo)',
    category: '原神',
    prompt: 'albedo (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-razor',
    name: '雷泽 (Razor)',
    category: '原神',
    prompt: 'razor (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-bennett',
    name: '班尼特 (Bennett)',
    category: '原神',
    prompt: 'bennett (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-mika',
    name: '米卡 (Mika)',
    category: '原神',
    prompt: 'mika (genshin impact)',
    isBuiltin: true
  },

  // 旅行者与愚人众/其他 (Travelers & Harbingers)
  {
    id: 'genshin-lumine',
    name: '荧 (Lumine)',
    category: '原神',
    prompt: 'lumine (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-aether',
    name: '空 (Aether)',
    category: '原神',
    prompt: 'aether (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-tartaglia',
    name: '达达利亚 (Tartaglia)',
    category: '原神',
    prompt: 'tartaglia (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-columbina',
    name: '哥伦比娅 (Columbina)',
    category: '原神',
    prompt: 'columbina (genshin impact)',
    isBuiltin: true
  },
  {
    id: 'genshin-sandrone',
    name: '木偶 (Sandrone)',
    category: '原神',
    prompt: 'sandrone (genshin impact)',
    isBuiltin: true
  },

  // ==========================================
  // 崩坏：星穹铁道 (Honkai: Star Rail)
  // ==========================================
  // 星穹列车 & 主角 (Astral Express & Trailblazer)
  {
    id: 'hsr-march-7th',
    name: '三月七 (March 7th)',
    category: '崩铁',
    prompt: 'march 7th (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-dan-heng',
    name: '丹恒 (Dan Heng)',
    category: '崩铁',
    prompt: 'dan heng (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-dan-heng-il',
    name: '丹恒·饮月 (Dan Heng · Imbibitor Lunae)',
    category: '崩铁',
    prompt: 'dan heng (imbibitor lunae) (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-himeko',
    name: '姬子 (Himeko)',
    category: '崩铁',
    prompt: 'himeko (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-welt',
    name: '瓦尔特·杨 (Welt Yang)',
    category: '崩铁',
    prompt: 'welt yang',
    isBuiltin: true
  },
  {
    id: 'hsr-stelle',
    name: '星 (Stelle)',
    category: '崩铁',
    prompt: 'stelle (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-caelus',
    name: '穹 (Caelus)',
    category: '崩铁',
    prompt: 'caelus (honkai: star rail)',
    isBuiltin: true
  },

  // 星核猎手 (Stellaron Hunters)
  {
    id: 'hsr-firefly',
    name: '流萤 (Firefly)',
    category: '崩铁',
    prompt: 'firefly (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-kafka',
    name: '卡芙卡 (Kafka)',
    category: '崩铁',
    prompt: 'kafka (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-silver-wolf',
    name: '银狼 (Silver Wolf)',
    category: '崩铁',
    prompt: 'silver wolf (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-blade',
    name: '刃 (Blade)',
    category: '崩铁',
    prompt: 'blade (honkai: star rail)',
    isBuiltin: true
  },

  // 匹诺康尼 & 自灭者 & 假面愚者 (Penacony & Self-Annihilators & Masked Fools)
  {
    id: 'hsr-acheron',
    name: '黄泉 (Acheron)',
    category: '崩铁',
    prompt: 'acheron (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-sparkle',
    name: '花火 (Sparkle)',
    category: '崩铁',
    prompt: 'sparkle (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-robin',
    name: '知更鸟 (Robin)',
    category: '崩铁',
    prompt: 'robin (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-sunday',
    name: '星期日 (Sunday)',
    category: '崩铁',
    prompt: 'sunday (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-black-swan',
    name: '黑天鹅 (Black Swan)',
    category: '崩铁',
    prompt: 'black swan (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-boothill',
    name: '波提欧 (Boothill)',
    category: '崩铁',
    prompt: 'boothill (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-gallagher',
    name: '加拉赫 (Gallagher)',
    category: '崩铁',
    prompt: 'gallagher (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-misha',
    name: '米沙 (Misha)',
    category: '崩铁',
    prompt: 'misha (honkai: star rail)',
    isBuiltin: true
  },

  // 仙舟联盟 (Xianzhou Alliance)
  {
    id: 'hsr-jingliu',
    name: '镜流 (Jingliu)',
    category: '崩铁',
    prompt: 'jingliu (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-jing-yuan',
    name: '景元 (Jing Yuan)',
    category: '崩铁',
    prompt: 'jing yuan',
    isBuiltin: true
  },
  {
    id: 'hsr-feixiao',
    name: '飞霄 (Feixiao)',
    category: '崩铁',
    prompt: 'feixiao (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-lingsha',
    name: '灵砂 (Lingsha)',
    category: '崩铁',
    prompt: 'lingsha (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-jiaoqiu',
    name: '椒丘 (Jiaoqiu)',
    category: '崩铁',
    prompt: 'jiaoqiu (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-moze',
    name: '貊泽 (Moze)',
    category: '崩铁',
    prompt: 'moze (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-yunli',
    name: '云璃 (Yunli)',
    category: '崩铁',
    prompt: 'yunli (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-fu-xuan',
    name: '符玄 (Fu Xuan)',
    category: '崩铁',
    prompt: 'fu xuan (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-tingyun',
    name: '停云 (Tingyun)',
    category: '崩铁',
    prompt: 'tingyun (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-fugue',
    name: '忘归人 (Fugue)',
    category: '崩铁',
    prompt: 'fugue (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-qingque',
    name: '青雀 (Qingque)',
    category: '崩铁',
    prompt: 'qingque (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-hanya',
    name: '寒鸦 (Hanya)',
    category: '崩铁',
    prompt: 'hanya (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-xueyi',
    name: '雪衣 (Xueyi)',
    category: '崩铁',
    prompt: 'xueyi (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-guinaifen',
    name: '桂乃芬 (Guinaifen)',
    category: '崩铁',
    prompt: 'guinaifen (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-sushang',
    name: '素裳 (Sushang)',
    category: '崩铁',
    prompt: 'sushang (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-yukong',
    name: '驭空 (Yukong)',
    category: '崩铁',
    prompt: 'yukong (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-yanqing',
    name: '彦卿 (Yanqing)',
    category: '崩铁',
    prompt: 'yanqing (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-luocha',
    name: '罗刹 (Luocha)',
    category: '崩铁',
    prompt: 'luocha (honkai: star rail)',
    isBuiltin: true
  },

  // 星际和平公司 & 博识学会 (IPC & Intelligentsia Guild)
  {
    id: 'hsr-topaz',
    name: '托帕 (Topaz)',
    category: '崩铁',
    prompt: 'topaz (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-aventurine',
    name: '砂金 (Aventurine)',
    category: '崩铁',
    prompt: 'aventurine (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-jade',
    name: '翡翠 (Jade)',
    category: '崩铁',
    prompt: 'jade (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-dr-ratio',
    name: '真理医生 (Dr. Ratio)',
    category: '崩铁',
    prompt: 'dr. ratio (honkai: star rail)',
    isBuiltin: true
  },

  // 黑塔空间站 & 天才俱乐部 (Herta Space Station & Genius Society)
  {
    id: 'hsr-ruan-mei',
    name: '阮·梅 (Ruan Mei)',
    category: '崩铁',
    prompt: 'ruan mei (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-herta',
    name: '黑塔 (Herta)',
    category: '崩铁',
    prompt: 'herta (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-the-herta',
    name: '大黑塔 (The Herta)',
    category: '崩铁',
    prompt: 'the herta (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-asta',
    name: '艾丝妲 (Asta)',
    category: '崩铁',
    prompt: 'asta (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-arlan',
    name: '阿兰 (Arlan)',
    category: '崩铁',
    prompt: 'arlan (honkai: star rail)',
    isBuiltin: true
  },

  // 雅利洛-VI / 贝洛伯格 (Belobog)
  {
    id: 'hsr-bronya',
    name: '布洛妮娅 (Bronya Rand)',
    category: '崩铁',
    prompt: 'bronya rand',
    isBuiltin: true
  },
  {
    id: 'hsr-seele',
    name: '希儿 (Seele)',
    category: '崩铁',
    prompt: 'seele (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-clara',
    name: '克拉拉 (Clara)',
    category: '崩铁',
    prompt: 'clara (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-gepard',
    name: '杰帕德 (Gepard Landau)',
    category: '崩铁',
    prompt: 'gepard landau',
    isBuiltin: true
  },
  {
    id: 'hsr-serval',
    name: '希露瓦 (Serval Landau)',
    category: '崩铁',
    prompt: 'serval landau',
    isBuiltin: true
  },
  {
    id: 'hsr-lynx',
    name: '玲可 (Lynx Landau)',
    category: '崩铁',
    prompt: 'lynx landau',
    isBuiltin: true
  },
  {
    id: 'hsr-pela',
    name: '佩拉 (Pela)',
    category: '崩铁',
    prompt: 'pela (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-natasha',
    name: '娜塔莎 (Natasha)',
    category: '崩铁',
    prompt: 'natasha (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-hook',
    name: '虎克 (Hook)',
    category: '崩铁',
    prompt: 'hook (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-luka',
    name: '卢卡 (Luka)',
    category: '崩铁',
    prompt: 'luka (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-sampo',
    name: '桑博 (Sampo Koski)',
    category: '崩铁',
    prompt: 'sampo koski',
    isBuiltin: true
  },

  // 巡海游侠 & 纯美骑士团 & 翁法罗斯 (Others)
  {
    id: 'hsr-rappa',
    name: '乱破 (Rappa)',
    category: '崩铁',
    prompt: 'rappa (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-argenti',
    name: '银枝 (Argenti)',
    category: '崩铁',
    prompt: 'argenti (honkai: star rail)',
    isBuiltin: true
  },
  {
    id: 'hsr-aglaea',
    name: '雅格莱雅 (Aglaea)',
    category: '崩铁',
    prompt: 'aglaea (honkai: star rail)',
    isBuiltin: true
  }
];

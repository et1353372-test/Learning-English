/* 即兴对话扩展库：主题参考美国国务院 American English
   《More Dialogs for Everyday Use》的 36 个情景；台词为适合口语练习的本地化改编。 */
const MORE_DIALOG_SEEDS = [
  ["more-01", "日常问候", "👋", "你在公司走廊遇到一位熟人。", "Good morning! How are you doing today?", "早上好！你今天怎么样？", "I’m doing well, thanks. How about you?", "我很好，谢谢。你呢？", "Pretty good. Are you busy this morning?", "挺好的。你今天上午忙吗？", "A little, but I can talk for a minute.", "有一点，不过我可以聊一会儿。"],
  ["more-02", "清晨出门", "🌅", "你和同伴约好一早出门。", "It’s time to get up. We need to leave soon.", "该起床了，我们很快得出发。", "I know. Give me five more minutes, please.", "我知道。再给我五分钟吧。", "All right, but let’s grab breakfast on the way.", "好吧，不过我们路上买早餐吧。", "Sounds good. I’ll be ready in a minute.", "听起来不错。我马上准备好。"],
  ["more-03", "采购日用品", "🛒", "家里的牛奶快喝完了，你在商量采购清单。", "We’re almost out of milk and cereal.", "牛奶和麦片快没了。", "Could you pick some up when you go to the store?", "你去商店时能买一些吗？", "Sure. Do we need anything else?", "当然。还需要别的吗？", "Maybe some fruit and bread for tomorrow.", "明天的水果和面包也买一点吧。"],
  ["more-04", "机场巴士", "🚌", "你需要赶去机场，正在确认巴士时间。", "Do you know when the airport bus leaves?", "你知道机场巴士什么时候发车吗？", "I think it leaves every thirty minutes.", "我想它每三十分钟一班。", "Great. Is there a number we can call to confirm?", "太好了。我们能打电话确认吗？", "Yes, let’s check before we head out.", "可以，我们出发前确认一下。"],
  ["more-05", "约时间见面", "📅", "你想和朋友约好明天一起参加活动。", "What time are you leaving tomorrow?", "你明天几点出发？", "Around nine thirty. Would you like to come with me?", "大概九点半。你想和我一起去吗？", "I’d love to. Can you pick me up?", "我很想去。你能来接我吗？", "Of course. I’ll be at your place at nine.", "当然。我九点到你家。"],
  ["more-06", "搭公交去动物园", "🦁", "你在问去动物园最方便的公交路线。", "Is this the bus stop for the zoo?", "这是去动物园的公交站吗？", "You can take the number eight from the next block.", "你可以在下一个街区坐八路车。", "Does it stop near the entrance?", "它在入口附近停吗？", "Yes, it stops right in front of the zoo.", "是的，就停在动物园门口。"],
  ["more-07", "早餐点单", "🍳", "你在餐馆点早餐。", "Are you ready to order breakfast?", "您准备好点早餐了吗？", "Yes. I’d like eggs, toast, and hot chocolate.", "好了。我想要鸡蛋、吐司和热巧克力。", "How would you like your eggs?", "鸡蛋您想怎么做？", "Over easy, please.", "请煎得嫩一点。"],
  ["more-08", "险些迟到", "🚗", "朋友开车差点错过重要约会。", "That was close. We almost missed the appointment.", "好险，我们差点错过约会。", "I know. Traffic was much worse than I expected.", "是啊，交通比我想的糟糕多了。", "Should we leave earlier next time?", "下次我们要不要早点出门？", "Definitely. Thirty minutes earlier would help.", "当然，提前半小时会有帮助。"],
  ["more-09", "确认到达时间", "⏰", "你在和同事确认火车到站时间。", "What time will your train arrive?", "你的火车几点到？", "It should get in around six fifteen.", "应该六点十五分左右到。", "Would you like me to meet you at the station?", "要我去车站接你吗？", "That would be great. Thank you.", "那太好了，谢谢你。"],
  ["more-10", "比赛结束后", "🏀", "你和朋友刚看完一场比赛。", "That was a great game, wasn’t it?", "那场比赛很精彩，对吧？", "Absolutely. The last few minutes were exciting.", "当然，最后几分钟很刺激。", "Do you want to get something to eat now?", "现在想去吃点东西吗？", "Sure. I know a good place nearby.", "好啊，我知道附近有家不错的店。"],
  ["more-11", "饭后散步", "🚶", "晚饭后你邀请朋友出去走走。", "It’s such a nice evening. Want to go for a walk?", "今晚天气真好。想去散步吗？", "Yes, I could use some fresh air.", "想，我正好需要透透气。", "Let’s walk around the park.", "我们绕公园走走吧。", "Perfect. I’ll get my jacket.", "太好了，我去拿外套。"],
  ["more-12", "晚餐吃什么", "🍲", "家人正在决定今晚吃什么。", "What would you like for dinner tonight?", "你今晚想吃什么？", "How about noodles with vegetables?", "蔬菜面怎么样？", "That sounds easy and delicious.", "听起来简单又好吃。", "Great. I’ll start cooking now.", "好，那我现在开始做。"],
  ["more-13", "聊电影奖项", "🏆", "你和朋友在聊刚公布的电影奖项。", "Did you watch the awards last night?", "你昨晚看颁奖典礼了吗？", "Yes, but I missed the final award.", "看了，不过我错过了最后一个奖。", "The film we liked won best picture.", "我们喜欢的那部电影得了最佳影片。", "Really? I’m glad it got recognized.", "真的吗？我很高兴它获奖了。"],
  ["more-14", "酒店入住", "🏨", "你到酒店前台办理入住。", "Good evening. Do you have a reservation?", "晚上好，您有预订吗？", "Yes, it’s under the name Chen.", "有，姓陈。", "I found it. Would you like one key or two?", "找到了。您要一张还是两张房卡？", "Two keys, please. Thank you.", "请给两张，谢谢。"],
  ["more-15", "电影之后", "🎬", "看完电影后，你们在交换感受。", "What did you think of the movie?", "你觉得这部电影怎么样？", "I liked it, especially the music.", "我喜欢，尤其是音乐。", "The ending surprised me.", "结局让我很惊讶。", "Me too. Let’s talk about it over coffee.", "我也是。我们喝咖啡时聊聊吧。"],
  ["more-16", "银行业务", "🏦", "你在银行办理一项简单业务。", "Hi, I’d like to deposit this check.", "你好，我想存这张支票。", "Certainly. Could I see your ID, please?", "当然。请出示您的身份证件。", "Here you are. Is there a fee?", "给您。需要手续费吗？", "No, there is no fee for this deposit.", "不用，这项存款不收费。"],
  ["more-17", "讨论新闻", "📰", "你和同事在讨论一条新闻。", "Did you see the news this morning?", "你今天早上看新闻了吗？", "Yes, I read about it on my phone.", "看了，我在手机上读到的。", "What do you think will happen next?", "你觉得接下来会怎样？", "I’m not sure, but I hope things improve soon.", "不确定，不过我希望事情尽快好转。"],
  ["more-18", "商量决定", "🤝", "你们需要一起决定周末如何安排。", "We need to talk this over before we decide.", "我们决定前得把这件事商量一下。", "I agree. What are our options?", "同意。我们有哪些选择？", "We can go now or wait until next week.", "我们可以现在去，也可以等到下周。", "Let’s sleep on it and decide tomorrow.", "我们考虑一晚，明天再决定吧。"],
  ["more-19", "周末计划", "🌤️", "你在问朋友这个周末有什么安排。", "Do you have any plans for the weekend?", "你周末有什么安排吗？", "I’m thinking of visiting my cousin.", "我想去看我表哥。", "That sounds nice. Are you staying overnight?", "听起来不错。你会过夜吗？", "Maybe. It depends on the weather.", "可能吧，要看天气。"],
  ["more-20", "晚餐邀请", "🍽️", "你邀请朋友来家里吃晚餐。", "Would you like to come over for dinner on Friday?", "周五想来我家吃晚餐吗？", "I’d love to. What time should I come?", "我很愿意。我几点来？", "Come around seven. I’ll make pasta.", "七点左右来吧。我会做意面。", "Great. Can I bring dessert?", "太好了。我能带甜点吗？"],
  ["more-21", "汽车保险", "🚙", "你在向保险工作人员询问汽车保险。", "I’d like to ask about car insurance.", "我想咨询汽车保险。", "Sure. What kind of coverage do you need?", "当然。您需要哪种保障？", "Something basic with roadside assistance.", "基础保障加道路救援。", "I can show you two plans that include that.", "我可以给您看两种包含这些的方案。"],
  ["more-22", "父母外出", "👨‍👩‍👧", "父母要外出，正在安排孩子的照看。", "We’re going out tonight. Are you okay staying home?", "我们今晚要出去。你一个人在家没问题吗？", "Yes, but can I invite a friend over?", "可以，不过我能邀请朋友来吗？", "That’s fine if you finish your homework first.", "可以，前提是你先完成作业。", "Deal. I’ll finish it before dinner.", "成交。我晚饭前完成。"],
  ["more-23", "聊经济与预算", "📈", "你和朋友在讨论最近的花费。", "Everything seems more expensive these days.", "最近什么都变贵了。", "I know. I’m trying to follow a budget.", "是啊，我正努力按预算花钱。", "What helps you save money?", "什么能帮你省钱？", "Cooking at home and planning purchases ahead.", "在家做饭并提前计划购买。"],
  ["more-24", "预约牙医", "🦷", "你打电话预约牙医。", "Hello, I’d like to make a dental appointment.", "你好，我想预约牙医。", "We have an opening on Tuesday afternoon.", "周二下午有空位。", "Could I have a morning appointment instead?", "我能约上午吗？", "Yes, we have ten thirty available.", "可以，十点半有空。"],
  ["more-25", "一起做计划", "🗒️", "你和朋友在安排一次活动。", "Let’s make a plan before everyone arrives.", "大家来之前我们先做个计划吧。", "Good idea. What should we do first?", "好主意。我们先做什么？", "Let’s book the tickets and then choose a restaurant.", "先订票，然后选餐厅。", "I’ll handle the tickets if you find a place to eat.", "你找吃饭的地方，我来订票。"],
  ["more-26", "邻里问题", "🏘️", "你礼貌地和邻居沟通噪音问题。", "Could we talk about the noise last night?", "我们能谈谈昨晚的噪音吗？", "I’m sorry. Was it too loud?", "抱歉，是不是太吵了？", "A little. I have an early meeting today.", "有一点。我今天有个很早的会议。", "I understand. I’ll keep it down tonight.", "我明白。今晚我会小声些。"],
  ["more-27", "车辆失窃", "🚓", "你在报警时说明车辆丢失的情况。", "I need to report that my car was stolen.", "我需要报案，我的车被偷了。", "When did you last see it?", "你最后一次见到它是什么时候？", "About an hour ago in the parking lot.", "大约一小时前，在停车场。", "Please give me the license plate number.", "请告诉我车牌号。"],
  ["more-28", "出门前准备", "🎒", "你们准备出门，正在核对物品。", "Are you ready to go?", "你准备好出发了吗？", "Almost. I just need my keys and phone.", "差不多了。我只需要拿钥匙和手机。", "Don’t forget your jacket. It might rain.", "别忘了外套，可能会下雨。", "Thanks for reminding me. I’ll get it now.", "谢谢提醒，我现在去拿。"],
  ["more-29", "购买礼物", "🛍️", "你在店里挑选一份礼物。", "Can I help you find something?", "我能帮您找什么吗？", "I’m looking for a birthday gift for my friend.", "我在给朋友找生日礼物。", "What kind of things does your friend like?", "您的朋友喜欢什么？", "She likes books and simple jewelry.", "她喜欢书和简约首饰。"],
  ["more-30", "收到邮件", "✉️", "家里刚收到邮件，你在确认有没有重要信件。", "The mail just arrived. Did I get anything?", "邮件刚到。我有信吗？", "Yes, there’s a letter from the bank.", "有，有一封银行寄来的信。", "Could you hand it to me, please?", "能递给我吗？", "Sure. It looks important.", "当然，看起来挺重要。"],
  ["more-31", "睡前安排", "🌙", "家长在提醒孩子准备睡觉。", "It’s getting late. Time to get ready for bed.", "不早了，该准备睡觉了。", "Can I finish this chapter first?", "我能先看完这一章吗？", "Okay, but only ten more minutes.", "可以，不过只能再看十分钟。", "Thanks. I’ll turn off the light after that.", "谢谢。之后我就关灯。"],
  ["more-32", "送修物品", "🔧", "你的物品坏了，正在咨询维修。", "My phone screen is cracked. Can you fix it?", "我的手机屏幕裂了。你们能修吗？", "Yes, we can replace it this afternoon.", "可以，今天下午就能换。", "How much will it cost?", "大概要多少钱？", "It will be about sixty dollars.", "大约六十美元。"],
  ["more-33", "家庭计划", "🏡", "一家人在讨论下个月的大计划。", "Have we decided what to do next month?", "我们决定下个月做什么了吗？", "Not yet. We’re still comparing ideas.", "还没有，我们还在比较方案。", "I’d like to visit Grandma for a weekend.", "我想去看奶奶，过个周末。", "That’s a lovely idea. Let’s ask her first.", "这是个好主意。我们先问问她吧。"],
  ["more-34", "商务出差", "💼", "同事在安排一次短期出差。", "When will you arrive for the business trip?", "你出差什么时候到？", "I plan to be there by tomorrow afternoon.", "我计划明天下午前到。", "Do you need me to book a hotel?", "需要我帮你订酒店吗？", "No, I made a reservation last week.", "不用，我上周已经订好了。"],
  ["more-35", "临时讨论", "💭", "朋友提醒你今晚有约，你却有别的安排。", "Don’t forget that Jim and Adrian are coming tonight.", "别忘了吉姆和阿德里安今晚要来。", "I thought they were coming next week.", "我以为他们下周才来。", "No, it’s tonight. Can you change your plans?", "不，是今晚。你能改一下计划吗？", "I’ll call my friend and see what I can do.", "我给朋友打电话看看能不能调整。"],
  ["more-36", "兄妹拌嘴", "🚘", "兄妹出门前因时间安排发生小争执。", "Come on, it’s time to go!", "快点，该走了！", "Wait a minute. I’m not ready yet.", "等一下，我还没准备好。", "I can give you five more minutes.", "我再给你五分钟。", "Okay, I’ll hurry. Thanks for waiting.", "好，我会快点。谢谢你等我。"],
];

const MORE_SERVICE_SCENARIO_IDS = new Set([
  "more-04", "more-06", "more-07", "more-14", "more-16",
  "more-21", "more-24", "more-27", "more-29", "more-32",
]);
const MORE_PLAN_SCENARIO_IDS = new Set([
  "more-03", "more-05", "more-08", "more-09", "more-12", "more-18",
  "more-19", "more-20", "more-22", "more-23", "more-25", "more-26",
  "more-28", "more-31", "more-33", "more-34", "more-35", "more-36",
]);

function moreScenarioTail(id) {
  const kind = MORE_SERVICE_SCENARIO_IDS.has(id) ? "service" : MORE_PLAN_SCENARIO_IDS.has(id) ? "plan" : "social";
  const tails = {
    service: [
      ["Before we finish, is there anything else you need?", "在结束前，您还有其他需要吗？", "确认是否还有其他需求", "No, that covers everything. Thank you for your help.", "没有了，这些就够了。谢谢您的帮助。"],
      ["You're welcome. Please let us know if you have any other questions.", "不客气，如有其他问题请告诉我们。", "礼貌回应并结束办理", "I will. Have a good day.", "好的。祝您今天愉快。"],
      ["You too. Take care.", "您也是，保重。", "礼貌道别", "Goodbye.", "再见。"],
    ],
    plan: [
      ["That sounds good. Is there anything we should do before then?", "听起来不错。在那之前我们要做什么吗？", "确认下一步准备", "I'll get it ready and send you an update.", "我会准备好并给你发消息更新。"],
      ["Perfect. Please let me know if the plan changes.", "太好了。如果计划有变请告诉我。", "确认保持沟通", "Of course. I'll keep you posted.", "当然，我会随时告知你。"],
      ["Great. Talk to you soon.", "很好，稍后联系。", "自然结束对话", "Talk to you soon.", "稍后联系。"],
    ],
    social: [
      ["That sounds nice. What would you like to do next?", "听起来不错。接下来你想做什么？", "自然提出下一步", "Let's keep it simple and enjoy the rest of the day.", "我们简单安排一下，好好享受今天剩下的时间吧。"],
      ["I like that idea. We can decide the details later.", "我喜欢这个主意。细节以后再定。", "赞同并延续话题", "Sounds good to me.", "我觉得不错。"],
      ["Great. I'll see you soon.", "太好了，待会见。", "自然道别", "See you soon.", "待会见。"],
    ],
  };
  return tails[kind].flatMap(([aEn, aZh, dir, bEn, bZh]) => [
    { who: "A", en: aEn, zh: aZh },
    { who: "B", dir, sugs: [{ en: bEn, zh: bZh }] },
  ]);
}

function makeMoreScenario(seed) {
  const [id, name, icon, intro, a1, a1Zh, b1, b1Zh, a2, a2Zh, b2, b2Zh] = seed;
  return {
    id, name, icon, intro,
    lines: [
      { who: "A", en: a1, zh: a1Zh },
      { who: "B", dir: "自然回应对方，并补充一个相关信息或问题", sugs: [{ en: b1, zh: b1Zh }] },
      { who: "A", en: a2, zh: a2Zh },
      { who: "B", dir: "确认信息、表达需求或给出下一步回应", sugs: [{ en: b2, zh: b2Zh }] },
    ].concat(moreScenarioTail(id)),
  };
}

const MORE_FREE_SCENARIOS = MORE_DIALOG_SEEDS.map(makeMoreScenario);

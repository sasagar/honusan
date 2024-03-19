import { SlashCreator, GatewayServer, SlashCommand, CommandOptionType } from 'slash-create';
import Eris from "eris";
import { fromEnv } from '@aws-sdk/credential-providers';
import { PollyClient, DescribeVoicesCommand, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import fs from "node:fs";
import dotenv from 'dotenv';
import log4js from "log4js";

dotenv.config();

process.title = `Honusan (${process.env.NAME})`;

log4js.configure({
    appenders: {
        stdout: {
            type: 'stdout'
        },
        system: {
            type: 'dateFile',
            filename: './logs/system.log',
            pattern: '-yyyy-MM-dd',
            keepFileExt: true,
            compress: true,
            numBackups: 5
        },
        systemError: {
            type: 'dateFile',
            filename: './logs/error.log',
            pattern: '-yyyy-MM-dd',
            keepFileExt: true,
            compress: true,
            numBackups: 5,
        }
    },
    categories: {
        default: {
            appenders: ['system'],
            level: 'info'
        },
        errors: {
            appenders: ['systemError'],
            level: 'error'
        }
    }
})

const logger = log4js.getLogger('default');

const bot = new Eris(process.env.BOT_SECRET, { restMode: true });

const region = process.env.AWS_REGION;

const client = new PollyClient({ region, credentials: fromEnv() });
const wbook = JSON.parse(fs.readFileSync('./wbook.json', 'utf8'));

let VOICE_CONNECTION = null;
let TtoV_CHANNEL = "";

let flag = false;
const msgs = [];

const cmdkey = process.env.COMMAND;
const cmdname = process.env.NAME;

// for non JP
import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import moji from "moji";
const kuroshiro = new Kuroshiro();
const analyzer = new KuromojiAnalyzer();

if (process.env.POLLY_LANG !== 'ja-JP') {
    kuroshiro.init(analyzer);
}

// describeVoices
const descParams = {
    LanguageCode: process.env.POLLY_LANG
};

bot.editStatus("online", {
    name: `/${cmdkey}`,
    type: 0
});

bot.on("ready", () => {
    logger.info("bot is ready at last.");
})

bot.on("messageCreate", (msg) => {
    try {
        if (msg.author.bot) return;

        if (msg.channel.id === TtoV_CHANNEL) {
            // メッセージを配列に入れる
            msgs.push(msg);
            // フラグがfalseなら
            if (!flag) {
                // フラグをtrueにする
                flag = true;
                // メッセージを繰り返し読む関数を実行する
                readAllMessages();
                // readText(msg);
            }
            // フラグがtrueなら何もしない
        }
    } catch (err) {
        logger.error(`Message Create Error: ${err}`)
    }
});

bot.connect();

if (VOICE_CONNECTION) {
    VOICE_CONNECTION.on("userDisconnect", (userID) => {
        logger.info(`VC User Disconnect: ${userID}`);
    });
}

const readText = async (msg) => {
    logger.trace("readText Start");
    try {
        // Get VoiceID
        // const dvcCommand = new DescribeVoicesCommand(descParams);
        // const dvcResponse = await client.send(dvcCommand);

        // .envのvoiceIdが数字かどうかで処理を分ける
        const voiceId = process.env.POLLY_VOICE;
        // if (!Number.isNaN(process.env.POLLY_VOICE)) {
        //     voiceId = dvcResponse.Voices[process.env.POLLY_VOICE].Id;
        // }
        logger.trace("readText Try");

        // Make text to read
        let author = '';
        if (msg.member.nick == null) {
            author = msg.author.username;
        } else {
            author = msg.member.nick;
        }

        let content = msg.content;
        content = content.replace(/>.+?\n/g, '');
        let textMsg = `${author}さん。${content}`;
        // 引用の削除
        textMsg = textMsg.replace(/>*\n/g, '');
        // 絵文字の置き換え
        textMsg = textMsg.replace(/<:(.+?):.+?>/g, '$1 ');
        // アニメーション絵文字の置き換え
        textMsg = textMsg.replace(/<a:(.+?):.+?>/g, '$1 ');
        // URLの省略
        textMsg = textMsg.replace(/http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w- ./?%&=~]*)?/g, ' URL省略 ');
        // ディスコード内の飛び先省略
        textMsg = textMsg.replace(/<#([0-9]+?)>/g, (match, p1) => {
            const mentionChannel = msg.channel.guild.channels.find((cnl) => {
                return cnl.id === p1;
            });
            return `${mentionChannel.name}チャンネル`;
        });
        // メンションの置き換え
        textMsg = textMsg.replace(/<@!([0-9]+?)>/g, (match, p1) => {
            const mentionName = msg.mentions.find(member => member.id === p1);
            return mentionName.username;
        });

        if (process.env.POLLY_LANG !== 'ja-JP') {
            textMsg = await kuroshiro.convert(
                moji(textMsg).convert('HK', 'ZK').toString(),
                {
                    to: "romaji",
                    mode: "spaced",
                    romajiSystem: "passport"
                }
            );
        }

        // エスケープ文字一式対応
        textMsg = textMsg.replace(/"/g, '&quot;');
        textMsg = textMsg.replace(/&/g, '&amp;');
        textMsg = textMsg.replace(/'/g, '&apos;');
        textMsg = textMsg.replace(/</g, '&lt;');
        textMsg = textMsg.replace(/>/g, '&gt;');

        // アンダースコアをスペースに
        textMsg = textMsg.replace(/_/g, ' ');

        if (wbook[msg.channel.guild.id]) {
            wbook[msg.channel.guild.id].forEach((exchanger) => {
                // 変換前の単語に$が入っていると上手く動作しない点の置換
                const reg = exchanger.before.replace(/\$/g, '\\$');
                textMsg = textMsg.replace(new RegExp(reg, 'ig'), exchanger.after);
            });
        }

        // synthesizeSpeech
        const speechParams = {
            Engine: process.env.POLLY_TYPE,
            OutputFormat: 'ogg_vorbis',
            VoiceId: voiceId,
            Text: `<prosody rate="fast">${textMsg}</prosody>`,
            TextType: 'ssml'
        };

        const sscCommand = new SynthesizeSpeechCommand(speechParams);
        const sscResponse = await client.send(sscCommand);

        // Send voice to VC.
        const stream = sscResponse.AudioStream;
        VOICE_CONNECTION.play(stream);

    }
    catch (err) {
        logger.error(err)
        bot.createMessage(TtoV_CHANNEL, `エラー(214)が起きています\`\`\`${err}\`\`\``);
    }


}

const readAllMessages = async () => {
    logger.trace("readAllMessages Start");
    while (flag) {
        try {
            logger.trace("readAllMessages While Start");
            if (msgs.length > 0) {
                logger.trace("readAllMessages Length Checked");
                await readText(msgs[0])
                logger.trace("readAllMessages Array shift");
                msgs.shift();
            } else {
                logger.trace("readAllMessages Length none");
                // 長さが0ならフラグをfalseに
                flag = false;
            }
            logger.trace("readAllMessages While Ended");
        } catch (err) {
            logger.error(`readAllMessages Error: ${err}`)
        }
    }
    logger.trace("readAllMessages Ended");
}

const join = class CONNECTION_CTRL extends SlashCommand {
    constructor(creator) {
        super(creator, {
            name: cmdkey,
            description: `${cmdname}の接続・接続解除`,
        });
    }

    async run(ctx) {
        try {
            const member = await bot.getRESTGuildMember(ctx.guildID, ctx.user.id);
            const voiceChannelID = member.voiceState.channelID;
            const textChannelID = ctx.channelID;

            const author = member.username;

            if (!VOICE_CONNECTION) {
                logger.info(`Connect to VC:${voiceChannelID}`);
                logger.info(`Connect to Text:${textChannelID}`);
                logger.info(`Connected by ${author}`);

                const vc = voiceChannelID;

                if (vc) {
                    // メッセージを書いた人のいるボイスチャットに入る
                    TtoV_CHANNEL = textChannelID;
                    bot.getChannel(vc).join().then(connection => {
                        VOICE_CONNECTION = connection;
                    });
                    return "VCに接続します。";
                }
                return "あなたはまだVCに居ないようです。どこに接続するか判断ができませんでした。";
            }
            logger.info(`Disconnect from VC:${voiceChannelID}`);
            logger.info(`Disconnect at Text:${textChannelID}`);
            logger.info(`Disconnected by ${author}`);

            VOICE_CONNECTION.disconnect();
            VOICE_CONNECTION = null;
            return "接続解除しました。"
        } catch (err) {
            logger.error(err);
            return `エラー(287)が起きています\`\`\`${err}\`\`\``;
        }
    }
}

const dicadd = class DICT_ADD extends SlashCommand {
    constructor(creator) {
        super(creator, {
            name: `${cmdkey}-add`,
            description: `${cmdname}に辞書登録します`,
            options: [{
                type: CommandOptionType.STRING,
                name: 'addword',
                description: '登録したい単語',
                required: true,
            }, {
                type: CommandOptionType.STRING,
                name: 'readas',
                description: '読み上げたい読み方',
                required: true,
            }]
        });
    }

    run(ctx) {
        try {
            const guildId = ctx.guildID;
            const before = ctx.options.addword;
            const after = ctx.options.readas;

            const word = {
                before,
                after
            };

            if (wbook[guildId]) {
                let i = 0;
                let wordsetFlag = true;
                wbook[guildId].forEach((wordset) => {
                    if (wordset.before === before) {
                        wbook[guildId][i].after = after;
                        wordsetFlag = false;
                    }
                    i = i + 1;
                });
                if (wordsetFlag) {
                    wbook[guildId].push(word);
                }
            } else {
                wbook[guildId] = [word];
            }
            fs.writeFileSync('wbook.json', JSON.stringify(wbook));
            logger.info(`DICT add: ${before} -> ${after}`);
            return `辞書登録しました。 ：${before} → ${after}`;
        } catch (err) {
            logger.error(err);
        }
    }
}

const dicrm = class DICT_REMOVE extends SlashCommand {
    constructor(creator) {
        super(creator, {
            name: `${cmdkey}-rm`,
            description: `${cmdname}の辞書から、単語登録を削除します`,
            options: [{
                type: CommandOptionType.STRING,
                name: 'rmword',
                description: '削除したい単語',
                required: true,
            }]
        });
    }

    run(ctx) {
        try {
            const guildId = ctx.guildID;
            const before = ctx.options.rmword;
            let worddelFlag = false;

            if (wbook[guildId]) {
                let i = 0;
                wbook[guildId].forEach((wordset) => {
                    if (wordset.before === before) {
                        wbook[guildId].splice(i, 1);
                        worddelFlag = true;
                    }
                    i = i + 1;
                });
            }
            fs.writeFileSync('wbook.json', JSON.stringify(wbook));
            if (worddelFlag) {
                logger.info(`DICT rm: ${before}`);
                return `辞書登録解除: ${before}`;
            }
            logger.info(`DICT rm fail: ${before} not found.`);
            return `辞書に「${before}」という単語がありませんでした。`;
        } catch (err) {
            logger.error(err);
        }
    }
}

/* Slash Command Init */
const creator = new SlashCreator({
    applicationID: process.env.APPLICATION_ID,
    publicKey: process.env.PUBLIC_KEY,
    token: process.env.BOT_SECRET,
});

const commands = [join, dicadd, dicrm];

creator
    .withServer(
        new GatewayServer(
            (handler) => bot.on('rawWS', (event) => {
                if (event.t === 'INTERACTION_CREATE') handler(event.d);
            })
        )
    )
await creator.registerCommands(commands)
await creator.syncCommands();


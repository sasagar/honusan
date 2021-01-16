const Eris = require("eris");
const aws = require("aws-sdk");
const fs = require("fs");
const {Readable} = require("stream");

require("dotenv").config();
 
const bot = new Eris(process.env.BOT_SECRET);

aws.config.loadFromPath('credentials.json');
let polly = new aws.Polly({region:'us-west-2'});
let wbook = require('./wbook.json');
// const { VoiceConnection } = require("eris");

let isConnection = null;
let VOICE_CONNECTION = null;
let TtoV_CHANNEL = "";

const prefix = process.env.BOT_PREFIX;
let flag = false;
let msgs = [];

// for non JP
import Kuroshiro from "kuroshiro";
const kuroshiro = new Kuroshiro();

// describeVoices
let descParams = {
    LanguageCode: process.env.POLLY_LANG
};

bot.editStatus("online", {
 'name': 'prefex: ' + process.env.BOT_PREFIX,
 'type': 0
});

bot.on("ready", () => {
    console.log("bot is ready at last.");
})

bot.on("messageCreate", (msg) => {
    if (msg.author.bot) return;

    isConnection = !!VOICE_CONNECTION;
    if ((msg.content == prefix + "summon" || msg.content == prefix + "s")&& !isConnection) {
        // console.log(msg.member.voiceState.channelID);
        const vc = msg.member.voiceState.channelID;

        if(vc) {
            // メッセージを書いた人のいるボイスチャットに入る
            TtoV_CHANNEL = msg.channel.id;
            bot.getChannel(vc).join().then(connection => {
                VOICE_CONNECTION= connection;
                bot.createMessage(TtoV_CHANNEL, "VCに接続します。");
            });
        } else {
            bot.createMessage(msg.channel.id, "あなたはまだVCに居ないようです。どこに接続するか判断ができませんでした。");
        }
    } else if (msg.content.startsWith( prefix + "wbook" )) {
        // 単語登録
        // guiid.idを取得
        let guildId = msg.channel.guild.id;
        // コマンドを分割
        let com = msg.content.split(' ');
        let before, after;
        let addword;

        // コマンドによって処理を分ける
        switch (com[1]) {
            case 'add':
                before = com[2];
                after = com[3];

                addword = {
                    "before": before,
                    "after": after
                };

                if (wbook[guildId]) {
                    let i = 0;
                    let wordsetFlag = true;
                    wbook[guildId].forEach((wordset) => {
                        if (wordset.before == before) {
                            wbook[guildId][i]['after'] = after; 
                            wordsetFlag = false;
                        }
                        i = i + 1;
                    });
                    if (wordsetFlag) {
                        wbook[guildId].push(addword);
                    }
                } else {
                    wbook[guildId] = [addword];
                }
                fs.writeFileSync('wbook.json', JSON.stringify(wbook));
                bot.createMessage(msg.channel.id, '辞書登録: ' + com[2] + ' → ' + com[3]);
                break;
            case 'remove':
            case 'delete':
                // eslint-disable-next-line no-case-declarations
                let worddelFlag = false;
                before = com[2];
                if (wbook[guildId]) {
                    let i = 0;
                    wbook[guildId].forEach((wordset) => {
                        if (wordset.before == before) {
                            wbook[guildId].splice(i, 1);
                            worddelFlag = true;
                        }
                        i = i + 1;
                    });
                }
                fs.writeFileSync('wbook.json', JSON.stringify(wbook));
                if (worddelFlag) {
                    bot.createMessage(msg.channel.id, '辞書登録解除: ' + com[2]);
                } else {
                    bot.createMessage(msg.channel.id, '辞書登録解除する単語がありませんでした。');
                }
                // console.log(wbook);
                break;
            default:
                bot.createMessage(msg.channel.id, 'コマンドが間違っているようです。 `' + prefix + 'wbook add <変換前> <変換後>` の形式か、`' + prefix + 'wbook remove <変換を止めたい単語>`の形式でコマンドを打ち込んでください。')
        }
        // console.log(msg.channel.guild.id);
    } else if (msg.channel.id == TtoV_CHANNEL) {
        // 終了コマンド end
        if(msg.content == prefix + "end" || msg.content == prefix + "bye" || msg.content == prefix + "dc") {
            if(isConnection) {
                VOICE_CONNECTION.disconnect();
                VOICE_CONNECTION = null;
                bot.createMessage(TtoV_CHANNEL, "接続解除しました。");
                return;
            }
        } else {
            // メッセージを配列に入れる
            msgs.push(msg);
            // フラグがfalseなら
            if (! flag) {
                // フラグをtrueにする
                flag = true;
                // メッセージを繰り返し読む関数を実行する
                readAllMessages();
                // readText(msg);
            }
            // フラグがtrueなら何もしない
        }

    }
});

bot.connect();

if (isConnection) {
	VOICE_CONNECTION.on("userDisconnect", (userID)=>{
		console.log(userID);
	});
}

const readText = (msg) => {

    return new Promise((res, rej) => {
        logStep("readText Start");
        try{
            polly.describeVoices(descParams, async (err, data) => {

                if (err) {
                    return rej(err);
                }
                // console.log(JSON.stringify(data));
                let voiceId = data.Voices[process.env.POLLY_VOICE].Id;
                logStep("readText Try");

                // テキストを作る
                let author = "";
                if (msg.member.nick == null) {
                    author = msg.author.username;
                } else {
                    author = msg.member.nick;
                }

                let content = msg.content;
                content = content.replace(/>.+?\n/g, '');
                let textMsg = author + 'さん。' + content;
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
                        return cnl.id == p1;
                    });
                    return mentionChannel.name + 'チャンネル';
                });
                // メンションの置き換え
                textMsg = textMsg.replace(/<@!([0-9]+?)>/g, (match, p1) => {
                    const mentionName = msg.mentions.find(member => member.id === p1);
                    return mentionName.username;
                });
				// エスケープ文字一式対応
				textMsg = textMsg.replace(/"/g, '&quot;');
				textMsg = textMsg.replace(/&/g, '&amp;');
				textMsg = textMsg.replace(/'/g, '&apos;');
				textMsg = textMsg.replace(/</g, '&lt;');
				textMsg = textMsg.replace(/>/g, '&gt;');

                // アンダースコアをスペースに
                textMsg = textMsg.replace(/_/g, ' ');

                // console.log(content);
                
                if (wbook[msg.channel.guild.id]) {
                    wbook[msg.channel.guild.id].forEach((exchanger) => {
                        textMsg = textMsg.replace(new RegExp(exchanger.before, 'ig'), exchanger.after);
                    });
                }

                if (process.env.POLLY_LANG != 'ja-JP') {
                    textMsg = await kuroshiro.convert(
                        textMsg,
                        {
                            to: "romaji",
                            mode: "spaced",
                            romajiSystem: "passport"
                        }
                    );
                }

                // synthesizeSpeech
                let speechParams = {
                    OutputFormat: 'ogg_vorbis',
                    VoiceId: voiceId,
                    Text: '<prosody rate="fast">' + textMsg + '</prosody>',
                    SampleRate: '22050',
                    TextType: 'ssml'
                };

                polly.synthesizeSpeech(speechParams, (err, data) => {
                    if (err) {
                        console.log(err);
                        bot.createMessage(TtoV_CHANNEL, "エラー(226)が起きています" + "```" + err + "```");
                        rej(err);
                    } else {
                        // readable streamを準備
                        const rs = new Readable({
                            read() {}
                        });

                        //
                        VOICE_CONNECTION.play(rs);
                        VOICE_CONNECTION.on("end", () => {
                            res();
                        });

                        rs.push(data.AudioStream);
                        rs.push(null);
                    }
                });
            });                
        } catch(e) {
            bot.createMessage(TtoV_CHANNEL, "エラー(246)が起きています" + "```" + e + "```");
            rej(e);
        }
    });
}

const readAllMessages = async () => {
    logStep("readAllMessages Start");
    while (flag) {
        logStep("readAllMessages While Start");
        if (msgs.length > 0) {
            logStep("readAllMessages Length Checked");
            await readText(msgs[0])
            logStep("readAllMessages Array shift");
            msgs.shift();
        } else {
            logStep("readAllMessages Length none");
            // 長さが0ならフラグをfalseに
            flag = false;
        }
        logStep("readAllMessages While Ended");
    }
    logStep("readAllMessages Ended");
}

// eslint-disable-next-line no-unused-vars
const logStep = (message) => {
    // console.log('--- ' + message + ' ---');
}

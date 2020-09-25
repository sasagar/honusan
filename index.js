const Eris = require("eris");
const aws = require("aws-sdk");
const fs = require("fs");
 
const bot = new Eris("NzU3NTIxNDkyMDg1OTY0ODMw.X2hm3Q.NehUCdbvirSL1dpJj4CdZqoEWU8");

aws.config.loadFromPath('credentials.json');
let polly = new aws.Polly({region:'us-west-2'});

let VOICE_CONNECTION = null;
let TtoV_CHANNEL = "";

const prefix = "&";
let flag = false;
let msgs = [];

// describeVoices
let descParams = {
    LanguageCode: 'ja-JP'
};


bot.on("ready", () => {
    console.log("bot is ready at last.");
})

bot.on("messageCreate", (msg) => {
    if (msg.author.bot) return;

    let isConnection = !!VOICE_CONNECTION;
    if (msg.content == prefix + "summon" && !isConnection) {
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

    } else if (msg.channel.id == TtoV_CHANNEL) {
        // 終了コマンド end
        if(msg.content == prefix + "end") {
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

const readText = (msg) => {
    // console.log(msg);

    return new Promise((res, rej) => {
        logStep("readText Start");
        try{
            polly.describeVoices(descParams, (err, data) => {

                if (err) {
                    return rej(err);
                }
                // console.log(JSON.stringify(data));
                let voiceId = data.Voices[0].Id;
                logStep("readText Try");

                // テキストを作る
                let author = msg.author.username;
                let content = msg.content.replace(/<:(.+?):.+?>/g, '$1 ');
                content = content.replace(/http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w- ./?%&=~]*)?/g, ' URL省略 ');
                let id = msg.id;
                
                // console.log(content);

                // synthesizeSpeech
                let textMsg = author + 'さん。' + content;
                let speechParams = {
                    OutputFormat: 'mp3',
                    VoiceId: voiceId,
                    Text: '<prosody rate="fast">' + textMsg + '</prosody>',
                    SampleRate: '22050',
                    TextType: 'ssml'
                };

                polly.synthesizeSpeech(speechParams).promise().then(data => {
                    fs.writeFile("sound_" + id + ".mp3", data.AudioStream, (err) => {
                        if (err) {
                            console.log(err);
                            rej(err);
                        } else {
                            //console.log('Success');
                        }
                    });
                }).then( () => {
                    new Promise((resolve) => {
                        VOICE_CONNECTION.play("sound_" + id + ".mp3");
                        VOICE_CONNECTION.on("end", () => {
                            resolve();
                        });
                    }).then( () => {
                        fs.unlinkSync("sound_" + id + ".mp3");
                        res();
                    })
                })
                .catch(err => {
                    console.log(err);
                    rej(err);
                });
            });                
        } catch(e) {
            bot.createMessage(TtoV_CHANNEL, "エラーが起きています" + "```" + e + "```");
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
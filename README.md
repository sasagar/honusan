# honusan v2.0,0
A Discord bot that speaks Amazon Polly

## extra files

You need extra files when clone the repository.  

### .env
include these options.
(reffer to env.sample, you can copy it as .env and edit.)

- BOT_SECRET: Discord bot TOKEN
- APPLICAITON_ID: Discord app ID
- PUBLIC_KEY: Discord app Public key
- COMMAND: Name of the slash command
- AWS_ACCESS_KEY_ID: IAM access key ID
- AWS_SECRET_ACCESS_KEY: IAM secreta access key
- AWS_REGION: IAM region (may be us-east-1)
- POLLY_LANG: language code
- POLLY_TYPE: standard or neural
- POLLY_VOICE: Voice name or the number of the voice (begin from 0)

## getting started

Start with command following.

```
docker compose up -d
```

## when updated

rebuild with command following.

```
docker compose build --no-cache
docker compose up -d
```
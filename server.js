const bodyParser = require('body-parser');
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const request = require('request');
const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1');
const { IamAuthenticator } = require('ibm-watson/auth');
require('dotenv').config();

// Iniciando app
const app = express();

// Extra configs
app.use(helmet());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Renderizar pasta build
app.use(express.static(path.join(__dirname, "/build")));

const initialCredentials = {
    apikey: process.env.NLU_API_KEY,
    model_id: process.env.MODEL_ID,
    url: process.env.NLU_URL
};

const setCredentials = (credentials) => {
    if (!credentials.apikey || !credentials.url || !credentials.model_id) {
        console.error('[server.js] ERRO - credenciais inválidas.');
        return {
            err: true,
            msg: "Credenciais inválidas."
        };
    };
    let nlu;
    try {
        nlu = new NaturalLanguageUnderstandingV1({
            version: '2019-07-12',
            authenticator: new IamAuthenticator({
                apikey: credentials.apikey,
            }),
            url: credentials.url,
        });
    } catch {
        return {
            err: true,
            msg: "Credenciais inválidas."
        };
    };
    return {
        err: false,
        nlu: nlu,
        wks: credentials.model_id,
        apikey: credentials.apikey,
        url: credentials.url
    };
};

let model = setCredentials(initialCredentials);

// POST /analise
app.post('/analise', (req, res) => {
    // Chamada para NLU
    console.log('POST @ /analise,', req.body);
    if (model.err === true) {
        res.send({
            err: true,
            msg: model.msg
        });
    } else {
        model.nlu.analyze({
            text: req.body.carta,
            features: {
                entities: {
                    model: model.wks
                },
                relations: {
                    model: model.wks
                }
            },
            language: "pt-br"
        })
            .then(analysisResults => {
                // console.log(JSON.stringify(analysisResults, null, 2));
                res.send({
                    err: false,
                    ...analysisResults
                });
            })
            .catch(err => {
                // console.log('error:', err);
                res.send({
                    err: true,
                    msg: "Não foi possível analisar a carta de natal.\n" + err.code + ' - ' + err.message
                });
            });
    };
});

// POST /credenciais
app.post('/credenciais', (req, res) => {
    console.log('POST @ /credenciais');
    model = setCredentials(req.body);
    if (model.err === true) {
        res.send(model);
    } else {
        model.nlu.analyze({
            text: "Testing Natural Language Understanding model and WKS.",
            features: {
                entities: {
                    model: model.wks
                },
                relations: {
                    model: model.wks
                }
            }
        })
            .then((ret) => {
                console.log('[server.js] Sucesso:', ret);
                res.send({
                    err: false,
                    msg: "Credenciais alteradas com sucesso."
                });
            })
            .catch((err) => {
                console.error('[server.js] Erro:', err);
                res.send({
                    err: true,
                    msg: "Credenciais inválidas."
                });
            });
    };
});

// POST /enviar
app.post('/enviar', (req, res) => {
    console.log('POST @ /enviar');
    request.post('http://maratona-proxy.mybluemix.net/api/ready/submit', {
        json: {
            id: process.env.USERNAME,
            nlu_apikey: model.apikey,
            model_id: model.wks,
            url: model.url,
            password: req.body.pass
        }
    }, (err, _, body) => {
        if (err) {
            console.error(err);
            res.send({
                err: true,
                msg: 'Houve algum erro interno. Por favor aguarde um momento ou contate um supervisor.'
            })
        } else {
            res.send(body);
        }
    });
});

// POST /pontos
app.post('/pontos', (req, res) => {
    console.log('POST @ /pontos');
    io.emit('pontuacaoRecebida', req.body);
    res.send({
        err: false,
        msg: 'OK'
    });
});

// GET /*
app.get('*', (_, res) => {
    res.redirect('/');
});

const port = process.env.PORT || 7000,
    host = process.env.HOST || '0.0.0.0';

const server = app.listen(port, host, () => {
    console.log(`App rodando no PORT ${port}`);
});

// Configurando websocket
const io = require('socket.io').listen(server);

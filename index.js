const express = require("express");
const ytdl = require('@distube/ytdl-core');
const cors = require("cors");

const app = express();

// 요청 크기 제한 증가 (Railway를 위한 설정)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS 설정 - 모든 origin 허용 (프로덕션에서는 특정 도메인으로 제한 권장)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'User-Agent'],
  credentials: false
}));

// OPTIONS 요청 처리 (preflight)
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, User-Agent');
  res.sendStatus(200);
});

app.get("/", (req, res) => {
    const ping = new Date();
    ping.setHours(ping.getHours() - 3);
    console.log(
        `Ping at: ${ping.getUTCHours()}:${ping.getUTCMinutes()}:${ping.getUTCSeconds()}`
    );
    res.header('Access-Control-Allow-Origin', '*');
    res.sendStatus(200);
});

app.get("/info", async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid query" });
        }

        const isValid = ytdl.validateURL(url);

        if (!isValid) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid url" });
        }

        const info = (await ytdl.getInfo(url)).videoDetails;
        const title = info.title;
        const thumbnail = info.thumbnails[2]?.url || info.thumbnails[0]?.url;

        res.header('Access-Control-Allow-Origin', '*');
        res.json({ title: title, thumbnail: thumbnail });
    } catch (error) {
        console.error("Error in /info:", error);
        res.header('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});

app.get("/mp3", async (req, res) => {
    let stream = null;
    try {
        const { url } = req.query;

        if (!url) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid query" });
        }

        console.log(`[MP3] Request received for URL: ${url}`);

        const isValid = ytdl.validateURL(url);

        if (!isValid) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid url" });
        }

        console.log(`[MP3] Fetching video info...`);
        const info = await ytdl.getInfo(url);
        const videoName = info.videoDetails.title;
        
        // 파일명 안전하게 처리 (특수문자 제거)
        const safeFileName = videoName.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim() || 'video';

        console.log(`[MP3] Video title: ${videoName}`);
        console.log(`[MP3] Starting download...`);

        // 스트림 생성 및 에러 핸들링
        // ytdl.chooseFormat을 사용하여 format 선택
        console.log(`[MP3] Available formats: ${info.formats.length}`);
        
        let selectedFormat = null;
        try {
            // 오디오 전용 포맷 선택 시도
            selectedFormat = ytdl.chooseFormat(info.formats, { 
                quality: 'highestaudio',
                filter: 'audioonly'
            });
            console.log(`[MP3] Selected format using chooseFormat: itag=${selectedFormat?.itag}`);
        } catch (e) {
            console.log(`[MP3] chooseFormat failed, trying manual selection...`);
        }
        
        // chooseFormat이 실패하면 수동으로 선택
        if (!selectedFormat) {
            const audioFormats = info.formats.filter(f => f.hasAudio && !f.hasVideo && f.url);
            if (audioFormats.length > 0) {
                selectedFormat = audioFormats[0];
                console.log(`[MP3] Manually selected audio-only format: itag=${selectedFormat.itag}`);
            } else {
                const formatsWithAudio = info.formats.filter(f => f.hasAudio && f.url);
                if (formatsWithAudio.length > 0) {
                    selectedFormat = formatsWithAudio[0];
                    console.log(`[MP3] Manually selected format with audio: itag=${selectedFormat.itag}`);
                }
            }
        }
        
        if (!selectedFormat || !selectedFormat.url) {
            // format 선택 실패 시 직접 URL로 시도
            console.log(`[MP3] No format with URL found, trying direct URL method...`);
            stream = ytdl(url, { quality: 'lowestaudio', filter: 'audioonly' });
        } else {
            console.log(`[MP3] Using format: itag=${selectedFormat.itag}, url exists: ${!!selectedFormat.url}`);
            stream = ytdl.downloadFromInfo(info, { format: selectedFormat });
        }
        console.log(`[MP3] Stream created successfully`);

        // 클라이언트 연결 종료 시 스트림 정리
        req.on('close', () => {
            console.log(`[MP3] Client disconnected`);
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        // 응답이 닫혔을 때 스트림 정리
        res.on('close', () => {
            console.log(`[MP3] Response closed`);
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        // 타임아웃 설정 (30분)
        res.setTimeout(1800000);

        // 스트림 데이터 전송 모니터링
        let bytesSent = 0;
        let headersSent = false;

        // 첫 데이터 청크가 도착하면 헤더 전송 후 스트림 파이핑
        stream.once('data', (firstChunk) => {
            if (!headersSent) {
                headersSent = true;
                console.log(`[MP3] First chunk received: ${firstChunk.length} bytes, sending headers...`);
                // 헤더를 명시적으로 전송하고 첫 청크를 쓰기
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Accept, User-Agent',
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFileName)}.mp3"`,
                    'Content-Type': 'audio/mpeg'
                });
                // 첫 청크를 응답에 쓰기
                res.write(firstChunk);
                bytesSent += firstChunk.length;
                console.log(`[MP3] First chunk written: ${firstChunk.length} bytes`);
                // 나머지 스트림을 파이핑
                stream.pipe(res, { end: false });
            }
        });

        stream.on('data', (chunk) => {
            bytesSent += chunk.length;
        });

        stream.on('error', (error) => {
            console.error(`[MP3] Stream error:`, error);
            console.error(`[MP3] Error details:`, {
                message: error.message,
                code: error.code,
                statusCode: error.statusCode,
                response: error.response?.statusCode
            });
            
            if (!headersSent) {
                res.writeHead(500, {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({ 
                    error: error.message || "Stream error occurred",
                    code: error.code,
                    statusCode: error.statusCode
                }));
            } else if (!res.finished && !res.destroyed) {
                try {
                    res.end();
                } catch (e) {
                    console.error(`[MP3] Error ending response:`, e);
                }
            }
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        stream.on('end', () => {
            console.log(`[MP3] Stream ended. Total bytes sent: ${bytesSent}`);
            if (!res.finished && !res.destroyed) {
                res.end();
            }
        });

        // 스트림이 데이터를 보내지 않으면 타임아웃 처리
        setTimeout(() => {
            if (!headersSent) {
                console.error(`[MP3] Timeout: No data received from stream`);
                if (!res.headersSent) {
                    res.writeHead(500, {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    });
                    res.end(JSON.stringify({ error: "Stream timeout: No data received" }));
                }
                if (stream && !stream.destroyed) {
                    stream.destroy();
                }
            }
        }, 30000); // 30초 타임아웃

    } catch (error) {
        console.error("[MP3] Error:", error);
        if (!res.headersSent) {
            res.header('Access-Control-Allow-Origin', '*');
            res.status(500).json({ error: error.message || "Internal server error" });
        } else if (!res.finished) {
            res.end();
        }
        // 스트림이 생성되었다면 정리
        if (stream) {
            stream.destroy();
        }
    }
});

app.get("/mp4", async (req, res) => {
    let stream = null;
    try {
        const { url } = req.query;

        if (!url) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid query" });
        }

        console.log(`[MP4] Request received for URL: ${url}`);

        const isValid = ytdl.validateURL(url);

        if (!isValid) {
            res.header('Access-Control-Allow-Origin', '*');
            return res.status(400).json({ error: "Invalid url" });
        }

        console.log(`[MP4] Fetching video info...`);
        const info = await ytdl.getInfo(url);
        const videoName = info.videoDetails.title;
        
        // 파일명 안전하게 처리 (특수문자 제거)
        const safeFileName = videoName.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim() || 'video';

        console.log(`[MP4] Video title: ${videoName}`);
        console.log(`[MP4] Starting download...`);

        // 스트림 생성 및 에러 핸들링
        // ytdl.chooseFormat을 사용하여 format 선택
        console.log(`[MP4] Available formats: ${info.formats.length}`);
        
        let selectedFormat = null;
        try {
            // 비디오 포맷 선택 시도
            selectedFormat = ytdl.chooseFormat(info.formats, { 
                quality: 'highest'
            });
            console.log(`[MP4] Selected format using chooseFormat: itag=${selectedFormat?.itag}`);
        } catch (e) {
            console.log(`[MP4] chooseFormat failed, trying manual selection...`);
        }
        
        // chooseFormat이 실패하면 수동으로 선택
        if (!selectedFormat) {
            const videoFormats = info.formats.filter(f => f.hasVideo && f.hasAudio && f.url);
            if (videoFormats.length > 0) {
                selectedFormat = videoFormats[0];
                console.log(`[MP4] Manually selected video format: itag=${selectedFormat.itag}`);
            }
        }
        
        if (!selectedFormat || !selectedFormat.url) {
            throw new Error('No suitable format with URL found');
        }
        
        console.log(`[MP4] Using format: itag=${selectedFormat.itag}, url exists: ${!!selectedFormat.url}`);
        stream = ytdl.downloadFromInfo(info, { format: selectedFormat });
        console.log(`[MP4] Stream created successfully`);

        // 클라이언트 연결 종료 시 스트림 정리
        req.on('close', () => {
            console.log(`[MP4] Client disconnected`);
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        // 응답이 닫혔을 때 스트림 정리
        res.on('close', () => {
            console.log(`[MP4] Response closed`);
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        // 타임아웃 설정 (30분)
        res.setTimeout(1800000);

        // 스트림 데이터 전송 모니터링
        let bytesSent = 0;
        let headersSent = false;

        // 첫 데이터 청크가 도착하면 헤더 전송 후 스트림 파이핑
        stream.once('data', (firstChunk) => {
            if (!headersSent) {
                headersSent = true;
                console.log(`[MP4] First chunk received: ${firstChunk.length} bytes, sending headers...`);
                // 헤더를 명시적으로 전송하고 첫 청크를 쓰기
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Accept, User-Agent',
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFileName)}.mp4"`,
                    'Content-Type': 'video/mp4'
                });
                // 첫 청크를 응답에 쓰기
                res.write(firstChunk);
                bytesSent += firstChunk.length;
                console.log(`[MP4] First chunk written: ${firstChunk.length} bytes`);
                // 나머지 스트림을 파이핑
                stream.pipe(res, { end: false });
            }
        });

        stream.on('data', (chunk) => {
            bytesSent += chunk.length;
        });

        stream.on('error', (error) => {
            console.error(`[MP4] Stream error:`, error);
            if (!headersSent) {
                res.writeHead(500, {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                });
                res.end(JSON.stringify({ error: error.message || "Stream error occurred" }));
            } else if (!res.finished && !res.destroyed) {
                try {
                    res.end();
                } catch (e) {
                    console.error(`[MP4] Error ending response:`, e);
                }
            }
            if (stream && !stream.destroyed) {
                stream.destroy();
            }
        });

        stream.on('end', () => {
            console.log(`[MP4] Stream ended. Total bytes sent: ${bytesSent}`);
            if (!res.finished && !res.destroyed) {
                res.end();
            }
        });

        // 스트림이 데이터를 보내지 않으면 타임아웃 처리
        setTimeout(() => {
            if (!headersSent) {
                console.error(`[MP4] Timeout: No data received from stream`);
                if (!res.headersSent) {
                    res.writeHead(500, {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json'
                    });
                    res.end(JSON.stringify({ error: "Stream timeout: No data received" }));
                }
                if (stream && !stream.destroyed) {
                    stream.destroy();
                }
            }
        }, 30000); // 30초 타임아웃

    } catch (error) {
        console.error("[MP4] Error:", error);
        if (!res.headersSent) {
            res.header('Access-Control-Allow-Origin', '*');
            res.status(500).json({ error: error.message || "Internal server error" });
        } else if (!res.finished) {
            res.end();
        }
        // 스트림이 생성되었다면 정리
        if (stream) {
            stream.destroy();
        }
    }
});

// 전역 에러 핸들러
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
        res.header('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// 프로세스 레벨 에러 핸들링
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 3500;

const server = app.listen(PORT, () => {
    console.log(`Server started successfully on port ${PORT}`);
}).on('error', (error) => {
    console.error('Server startup error:', error);
    process.exit(1);
});

// Railway를 위한 타임아웃 설정 (30분)
server.timeout = 1800000;
server.keepAliveTimeout = 1800000;
server.headersTimeout = 1800000;

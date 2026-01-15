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
        try {
            stream = ytdl(url, { 
                quality: "highestaudio",
                filter: "audioonly"
            });
        } catch (streamError) {
            console.error(`[MP3] Failed to create stream:`, streamError);
            res.header('Access-Control-Allow-Origin', '*');
            res.status(500).json({ error: streamError.message || "Failed to create stream" });
            return;
        }

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

        stream.on('error', (error) => {
            console.error(`[MP3] Stream error:`, error);
            if (!headersSent) {
                res.header('Access-Control-Allow-Origin', '*');
                res.status(500).json({ error: error.message || "Stream error occurred" });
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
                res.write(firstChunk);
                bytesSent += firstChunk.length;
                // 나머지 스트림을 파이핑
                stream.pipe(res, { end: false });
            }
        });

        stream.on('data', (chunk) => {
            if (headersSent) {
                bytesSent += chunk.length;
            }
        });

        stream.on('end', () => {
            console.log(`[MP3] Stream ended. Total bytes sent: ${bytesSent}`);
            if (!res.finished && !res.destroyed) {
                res.end();
            }
        });

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
        try {
            stream = ytdl(url, {
                quality: "highest"
            });
        } catch (streamError) {
            console.error(`[MP4] Failed to create stream:`, streamError);
            res.header('Access-Control-Allow-Origin', '*');
            res.status(500).json({ error: streamError.message || "Failed to create stream" });
            return;
        }

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

        stream.on('error', (error) => {
            console.error(`[MP4] Stream error:`, error);
            if (!headersSent) {
                res.header('Access-Control-Allow-Origin', '*');
                res.status(500).json({ error: error.message || "Stream error occurred" });
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
                res.write(firstChunk);
                bytesSent += firstChunk.length;
                // 나머지 스트림을 파이핑
                stream.pipe(res, { end: false });
            }
        });

        stream.on('data', (chunk) => {
            if (headersSent) {
                bytesSent += chunk.length;
            }
        });

        stream.on('end', () => {
            console.log(`[MP4] Stream ended. Total bytes sent: ${bytesSent}`);
            if (!res.finished && !res.destroyed) {
                res.end();
            }
        });

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
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = app.listen(process.env.PORT || 3500, () => {
    console.log(`Server on port ${process.env.PORT || 3500}`);
});

// Railway를 위한 타임아웃 설정 (30분)
server.timeout = 1800000;
server.keepAliveTimeout = 1800000;
server.headersTimeout = 1800000;

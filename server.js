/* ============================================
   TOM.AIWEB — SECURE SERVER
   Discord OAuth2 + Role-based access control
   Express + Server-side sessions
   ============================================ */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* ============================================
   CONFIGURATION — validated at startup
   ============================================ */
const REQUIRED_ENV = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_ROLE_ID',
  'SESSION_SECRET',
  'BASE_URL',
];

const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`\n❌ Variables d'environnement manquantes :\n   ${missing.join('\n   ')}`);
  console.error(`\n   → Copiez .env.example vers .env et remplissez les valeurs.\n`);
  process.exit(1);
}

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_ROLE_ID,
  SESSION_SECRET,
  BASE_URL,
} = process.env;

const DISCORD_API = 'https://discord.com/api/v10';
const REDIRECT_URI = `${BASE_URL}/auth/discord/callback`;
const OAUTH_SCOPES = 'identify';

/* ============================================
   SECURITY MIDDLEWARE
   ============================================ */

// Helmet — secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://cdn.discordapp.com"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting — global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans quelques minutes.' },
}));

// Aggressive rate limit on auth routes
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  max: 15,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 5 minutes.' },
});

// Parse JSON bodies (for potential API usage)
app.use(express.json());

/* ============================================
   SESSION — server-side, secure cookies
   ============================================ */

// Optional Redis store for production
let sessionStore;
if (process.env.REDIS_URL) {
  const RedisStore = require('connect-redis').default;
  const Redis = require('ioredis');
  const redisClient = new Redis(process.env.REDIS_URL);
  sessionStore = new RedisStore({ client: redisClient });
  console.log('✅ Redis session store connecté');
}

const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', isProduction ? 1 : false);

app.use(session({
  store: sessionStore || undefined, // memory store in dev, Redis in prod
  secret: SESSION_SECRET,
  name: '__tomaiweb_sid',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,                        // JS ne peut pas lire le cookie
    secure: isProduction,                  // HTTPS only en prod
    sameSite: 'lax',                       // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000,      // 7 jours
  },
}));

/* ============================================
   CSRF PROTECTION — state parameter
   ============================================ */
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

function timingSafeEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/* ============================================
   AUTH MIDDLEWARE
   ============================================ */
function requireAuth(req, res, next) {
  if (req.session && req.session.user && req.session.authenticated) {
    return next();
  }
  // If it's an API call, return 401
  if (req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  // Otherwise redirect to login
  return res.redirect('/login.html');
}

/* ============================================
   DISCORD API HELPERS
   ============================================ */

// Exchange authorization code for access token
async function exchangeCode(code) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Discord token exchange failed: ${response.status} — ${err}`);
  }

  return response.json();
}

// Get user info from Discord
async function getDiscordUser(accessToken) {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Discord user fetch failed: ${response.status}`);
  }

  return response.json();
}

// Check if user has the required role on the guild (using Bot token)
async function checkMemberRole(userId) {
  const response = await fetch(`${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${userId}`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
  });

  if (response.status === 404) {
    return { isMember: false, hasRole: false };
  }

  if (!response.ok) {
    throw new Error(`Discord member fetch failed: ${response.status}`);
  }

  const member = await response.json();
  const hasRole = member.roles.includes(DISCORD_ROLE_ID);

  return { isMember: true, hasRole, roles: member.roles };
}

/* ============================================
   ROUTES — AUTH
   ============================================ */

// Start Discord OAuth2 flow
app.get('/auth/discord', authLimiter, (req, res) => {
  const state = generateState();
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    state,
    prompt: 'none', // skip consent screen if already authorized
  });

  res.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
});

// Discord OAuth2 callback
app.get('/auth/discord/callback', authLimiter, async (req, res) => {
  try {
    const { code, state, error } = req.query;

    // Discord returned an error (user denied, etc.)
    if (error) {
      console.warn(`Discord OAuth error: ${error}`);
      return res.redirect('/login.html?error=denied');
    }

    // Validate required params
    if (!code || !state) {
      return res.redirect('/login.html?error=invalid');
    }

    // CSRF check — constant-time comparison
    if (!timingSafeEqual(state, req.session.oauthState)) {
      console.warn('CSRF state mismatch');
      req.session.destroy(() => { });
      return res.redirect('/login.html?error=csrf');
    }

    // Clear used state immediately
    delete req.session.oauthState;

    // Exchange code for token
    const tokenData = await exchangeCode(code);

    // Get Discord user info
    const discordUser = await getDiscordUser(tokenData.access_token);

    // Check role on guild via Bot
    const { isMember, hasRole } = await checkMemberRole(discordUser.id);

    if (!isMember) {
      console.log(`❌ Accès refusé: ${discordUser.username} (${discordUser.id}) — pas sur le serveur`);
      return res.redirect('/login.html?error=not_member');
    }

    if (!hasRole) {
      console.log(`❌ Accès refusé: ${discordUser.username} (${discordUser.id}) — rôle manquant`);
      return res.redirect('/pricing');
    }

    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration failed:', err);
        return res.redirect('/login.html?error=server');
      }

      // Store user in session
      req.session.authenticated = true;
      req.session.user = {
        id: discordUser.id,
        username: discordUser.username,
        displayName: discordUser.global_name || discordUser.username,
        avatar: discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
          : null,
        authenticatedAt: Date.now(),
      };

      req.session.save((err) => {
        if (err) {
          console.error('Session save failed:', err);
          return res.redirect('/login.html?error=server');
        }
        console.log(`✅ Accès accordé: ${discordUser.username} (${discordUser.id})`);
        return res.redirect('/formation');
      });
    });

  } catch (err) {
    console.error('Auth callback error:', err.message);
    return res.redirect('/login.html?error=server');
  }
});

// Logout
app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.clearCookie('__tomaiweb_sid');
    res.json({ success: true });
  });
});

// Auth status (for frontend)
app.get('/auth/status', (req, res) => {
  if (req.session?.authenticated && req.session?.user) {
    return res.json({
      authenticated: true,
      user: {
        username: req.session.user.username,
        displayName: req.session.user.displayName,
        avatar: req.session.user.avatar,
      },
    });
  }
  return res.json({ authenticated: false });
});

/* ============================================
   ROUTES — PROTECTED PAGES
   ============================================ */

// Pricing page — public
app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, 'pricing.html'));
});

// Formation page — protected
app.get('/formation', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'formation.html'));
});

// Prevent direct access to formation.html
app.get('/formation.html', (req, res) => {
  res.redirect('/formation');
});

/* ============================================
   STATIC FILES — public pages
   ============================================ */
app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  // Block direct file access to formation.html
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('formation.html')) {
      res.status(403);
    }
  },
}));

/* ============================================
   404 HANDLER
   ============================================ */
app.use((req, res) => {
  res.status(404).redirect('/');
});

/* ============================================
   ERROR HANDLER
   ============================================ */
app.use((err, req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Erreur serveur interne' });
});

/* ============================================
   START SERVER
   ============================================ */
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║          TOM.AIWEB — SERVER              ║
╠══════════════════════════════════════════╣
║  🌐  ${BASE_URL.padEnd(36)} ║
║  🔒  Discord OAuth2 actif                ║
║  🛡️   Guild: ${DISCORD_GUILD_ID.padEnd(28)} ║
║  🎭  Role: ${DISCORD_ROLE_ID.padEnd(29)} ║
║  ${isProduction ? '🚀  Mode: PRODUCTION' : '🔧  Mode: DEVELOPMENT'}${' '.repeat(isProduction ? 21 : 20)} ║
${!sessionStore ? '║  ⚠️   Sessions en mémoire (ajoutez Redis) ║' : '║  ✅  Redis session store connecté          ║'}
╚══════════════════════════════════════════╝
  `);
});

/**
 * METEOR HUB CONFIGURATION
 * Edit the values below before running the server.
 */

module.exports = {
  // Discord OAuth2 Configuration
  discord: {
    clientID: process.env.DISCORD_CLIENT_ID || 'YOUR_DISCORD_CLIENT_ID',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || 'YOUR_DISCORD_CLIENT_SECRET',
    // Must match your Discord app redirect URI exactly
    callbackURL: process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback',
    scope: ['identify', 'email']
  },

  // Administrative Discord IDs (array of strings)
  // These users can post announcements, view all tickets, and access live chat support
  adminIds: [
    'OWNER_DISCORD_ID_HERE',
    'ADMIN_DISCORD_ID_HERE'
  ],

  // Owner Discord ID (string) - displayed on site
  ownerId: 'OWNER_DISCORD_ID_HERE',

  // Session & Security
  sessionSecret: process.env.SESSION_SECRET || 'meteor_hub_secret_change_this_in_production',
  
  // Server
  port: process.env.PORT || 3000,

  // Products Configuration - Add/Edit products here
  products: [
    {
      id: 'enclave',
      name: 'Enclave',
      tagline: 'Roblox Security',
      description: 'The best anti-cheat solution for Roblox games. Protect your experiences from exploiters, hackers, and cheaters with real-time detection and automated banning.',
      icon: 'E',
      iconBg: 'rgba(239, 68, 68, 0.15)',
      iconColor: '#ef4444',
      price: null,
      featured: false,
      features: ['Real-time exploit detection', 'Automated ban system', 'Server-side validation', 'Detailed logs & analytics']
    },
    {
      id: 'swift',
      name: 'Swift',
      tagline: 'Roblox AI',
      description: 'AI-Powered Roblox Coder. Generate complete Lua scripts, debug issues, and learn best practices with AI. Built exclusively for Roblox developers who want to ship faster.',
      icon: 'S',
      iconBg: 'rgba(45, 212, 191, 0.15)',
      iconColor: '#2dd4bf',
      price: '$9.99/month',
      featured: true,
      features: ['Unlimited code generation', 'Debug assistant', 'Roblox API integration', 'Priority support', 'Early access to new features']
    },
    {
      id: 'nectar',
      name: 'Nectar',
      tagline: 'Roblox Marketplace',
      description: 'A complete marketplace platform for Roblox. Sell gamepasses, assets, scripts, and services to players and fellow developers with zero commission.',
      icon: 'N',
      iconBg: 'rgba(250, 204, 21, 0.15)',
      iconColor: '#facc15',
      price: null,
      featured: false,
      features: ['Zero commission fees', 'Instant payouts', 'Asset verification', 'Developer API access']
    }
  ],

  // Links Configuration
  links: [
    { name: 'Discord Server', description: 'Join for support & updates', url: 'https://discord.gg/YOUR_INVITE', icon: 'message-circle' },
    { name: 'Terms of Service', description: 'Legal guidelines', url: '/legal/tos', icon: 'file-text' },
    { name: 'Privacy Policy', description: 'Data protection info', url: '/legal/privacy', icon: 'shield' },
    { name: 'YouTube Channel', description: 'Tutorials & showcases', url: 'https://youtube.com/@YOUR_CHANNEL', icon: 'play' },
    { name: 'Purchase Hub', description: 'Buy our products', url: '#products', icon: 'shopping-bag' },
    { name: 'Roblox Hub', description: 'Roblox community group', url: 'https://roblox.com/groups/YOUR_GROUP', icon: 'box' }
  ]
};

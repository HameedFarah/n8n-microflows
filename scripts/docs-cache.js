#!/usr/bin/env node

/**
 * Smart Documentation Cache Manager
 * Minimizes Context7 API calls by intelligently caching N8N node documentation
 * Integrates with existing context preservation system
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

class SmartDocumentationCache {
  constructor() {
    this.cacheDir = path.join(process.cwd(), '.n8n-docs-cache');
    this.metadataFile = path.join(this.cacheDir, 'cache-metadata.json');
    this.statsFile = path.join(this.cacheDir, 'cache-stats.json');
    
    // Cache configuration
    this.config = {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      maxSize: 100 * 1024 * 1024, // 100MB max cache size
      compressionEnabled: true,
      prefetchPopular: true,
      autoCleanup: true
    };
    
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      apiCallsSaved: 0,
      tokensSaved: 0,
      costSaved: 0
    };
    
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.loadStats();
      await this.loadMetadata();
      
      // Auto-cleanup old cache entries
      if (this.config.autoCleanup) {
        await this.cleanup();
      }
    } catch (error) {
      console.warn('Cache initialization warning:', error.message);
    }
  }

  /**
   * Get node documentation with smart caching
   */
  async getNodeDocumentation(nodeType, options = {}) {
    console.log(`📚 Getting docs for node: ${nodeType}`);
    
    this.stats.totalRequests++;
    
    const cacheKey = this.generateCacheKey(nodeType, options);
    const cached = await this.getCached(cacheKey);
    
    if (cached && !options.forceRefresh) {
      console.log(`✅ Cache hit for ${nodeType}`);
      this.stats.cacheHits++;
      await this.updateAccessTime(cacheKey);
      return {
        source: 'cache',
        data: cached.data,
        cachedAt: cached.cachedAt,
        size: cached.size
      };
    }

    console.log(`🌐 Cache miss for ${nodeType}, fetching from Context7...`);
    this.stats.cacheMisses++;
    
    // In a real implementation, this would call Context7 API
    // For now, we'll simulate the response
    const documentation = await this.fetchFromContext7(nodeType, options);
    
    if (documentation) {
      await this.setCached(cacheKey, documentation, nodeType);
      this.stats.apiCallsSaved++; // This would be incremented on subsequent cache hits
      
      return {
        source: 'api',
        data: documentation,
        nodeType: nodeType
      };
    }

    return {
      source: 'error',
      error: 'Failed to fetch documentation',
      nodeType: nodeType
    };
  }

  /**
   * Generate cache key for node documentation
   */
  generateCacheKey(nodeType, options = {}) {
    const keyData = {
      nodeType,
      topic: options.topic || '',
      version: options.version || 'latest',
      tokens: options.tokens || 10000
    };
    
    const keyString = JSON.stringify(keyData);
    return crypto.createHash('md5').update(keyString).digest('hex');
  }

  /**
   * Get cached documentation
   */
  async getCached(cacheKey) {
    try {
      const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);
      const cacheFile = await fs.readFile(cachePath, 'utf8');
      const cached = JSON.parse(cacheFile);
      
      // Check if cache is still valid
      const now = Date.now();
      const age = now - cached.cachedAt;
      
      if (age > this.config.maxAge) {
        console.log(`⏰ Cache expired for key ${cacheKey}`);
        await this.removeCached(cacheKey);
        return null;
      }
      
      return cached;
    } catch (error) {
      return null;
    }
  }

  /**
   * Set cached documentation
   */
  async setCached(cacheKey, data, nodeType) {
    try {
      const cached = {
        cacheKey,
        nodeType,
        data,
        cachedAt: Date.now(),
        accessCount: 1,
        lastAccess: Date.now(),
        size: JSON.stringify(data).length
      };
      
      const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);
      await fs.writeFile(cachePath, JSON.stringify(cached, null, 2));
      
      await this.updateMetadata(cacheKey, cached);
      await this.saveStats();
      
      console.log(`💾 Cached documentation for ${nodeType} (${cached.size} bytes)`);
    } catch (error) {
      console.warn('Failed to cache documentation:', error.message);
    }
  }

  /**
   * Remove cached entry
   */
  async removeCached(cacheKey) {
    try {
      const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);
      await fs.unlink(cachePath);
      
      // Update metadata
      if (this.metadata) {
        delete this.metadata[cacheKey];
        await this.saveMetadata();
      }
    } catch (error) {
      // File might not exist, ignore
    }
  }

  /**
   * Update access time for cache entry
   */
  async updateAccessTime(cacheKey) {
    try {
      if (this.metadata && this.metadata[cacheKey]) {
        this.metadata[cacheKey].lastAccess = Date.now();
        this.metadata[cacheKey].accessCount++;
        await this.saveMetadata();
      }
    } catch (error) {
      console.warn('Failed to update access time:', error.message);
    }
  }

  /**
   * Simulate Context7 API call (replace with real implementation)
   */
  async fetchFromContext7(nodeType, options = {}) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate different documentation for different node types
    const mockDocs = {
      'nodes-base.slack': {
        description: 'Send messages to Slack channels',
        parameters: {
          channel: 'Channel to send message to',
          text: 'Message text to send',
          username: 'Username to send message as'
        },
        examples: [
          {
            description: 'Send simple message',
            configuration: {
              channel: '#general',
              text: 'Hello, team!'
            }
          }
        ],
        credentials: ['slackApi'],
        documentation: 'Full documentation for Slack node...'
      },
      'nodes-base.httpRequest': {
        description: 'Make HTTP requests to external APIs',
        parameters: {
          method: 'HTTP method (GET, POST, PUT, DELETE)',
          url: 'URL to make request to',
          authentication: 'Authentication method'
        },
        examples: [
          {
            description: 'GET request',
            configuration: {
              method: 'GET',
              url: 'https://api.example.com/data'
            }
          }
        ],
        credentials: ['httpBasicAuth', 'httpHeaderAuth'],
        documentation: 'Full documentation for HTTP Request node...'
      }
    };

    const nodeKey = nodeType.replace('n8n-', '');
    return mockDocs[nodeKey] || {
      description: `Documentation for ${nodeType}`,
      parameters: {},
      examples: [],
      documentation: `Mock documentation for ${nodeType} node`
    };
  }

  /**
   * Load cache metadata
   */
  async loadMetadata() {
    try {
      const metadataContent = await fs.readFile(this.metadataFile, 'utf8');
      this.metadata = JSON.parse(metadataContent);
    } catch (error) {
      this.metadata = {};
    }
  }

  /**
   * Save cache metadata
   */
  async saveMetadata() {
    try {
      await fs.writeFile(this.metadataFile, JSON.stringify(this.metadata, null, 2));
    } catch (error) {
      console.warn('Failed to save metadata:', error.message);
    }
  }

  /**
   * Update metadata for cache entry
   */
  async updateMetadata(cacheKey, cached) {
    this.metadata[cacheKey] = {
      nodeType: cached.nodeType,
      cachedAt: cached.cachedAt,
      lastAccess: cached.lastAccess,
      accessCount: cached.accessCount,
      size: cached.size
    };
    await this.saveMetadata();
  }

  /**
   * Load cache statistics
   */
  async loadStats() {
    try {
      const statsContent = await fs.readFile(this.statsFile, 'utf8');
      this.stats = { ...this.stats, ...JSON.parse(statsContent) };
    } catch (error) {
      // Use default stats
    }
  }

  /**
   * Save cache statistics
   */
  async saveStats() {
    try {
      await fs.writeFile(this.statsFile, JSON.stringify(this.stats, null, 2));
    } catch (error) {
      console.warn('Failed to save stats:', error.message);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const hitRate = this.stats.totalRequests > 0 
      ? (this.stats.cacheHits / this.stats.totalRequests * 100).toFixed(1)
      : 0;

    const cacheSize = await this.getCacheSize();
    const entryCount = Object.keys(this.metadata || {}).length;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      cacheSize: this.formatBytes(cacheSize),
      entryCount,
      estimatedTokensSaved: this.stats.apiCallsSaved * 2000, // Rough estimate
      estimatedCostSaved: (this.stats.apiCallsSaved * 2000 / 1000) * 0.01 // $0.01 per 1K tokens
    };
  }

  /**
   * Get total cache size
   */
  async getCacheSize() {
    try {
      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'cache-metadata.json' && file !== 'cache-stats.json') {
          const filePath = path.join(this.cacheDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }
      
      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Clean up old cache entries
   */
  async cleanup() {
    try {
      const now = Date.now();
      const maxAge = this.config.maxAge;
      
      for (const [cacheKey, meta] of Object.entries(this.metadata || {})) {
        const age = now - meta.cachedAt;
        
        if (age > maxAge) {
          console.log(`🧹 Cleaning up expired cache entry: ${meta.nodeType}`);
          await this.removeCached(cacheKey);
        }
      }
      
      // Check total cache size
      const cacheSize = await this.getCacheSize();
      if (cacheSize > this.config.maxSize) {
        await this.cleanupBySize();
      }
      
    } catch (error) {
      console.warn('Cache cleanup failed:', error.message);
    }
  }

  /**
   * Clean up cache entries by size (LRU)
   */
  async cleanupBySize() {
    try {
      // Sort by last access time (oldest first)
      const entries = Object.entries(this.metadata || {})
        .sort(([,a], [,b]) => a.lastAccess - b.lastAccess);
      
      let currentSize = await this.getCacheSize();
      const targetSize = this.config.maxSize * 0.8; // Clean to 80% of max size
      
      for (const [cacheKey, meta] of entries) {
        if (currentSize <= targetSize) break;
        
        console.log(`🧹 Removing cache entry to free space: ${meta.nodeType}`);
        await this.removeCached(cacheKey);
        currentSize -= meta.size;
      }
      
    } catch (error) {
      console.warn('Size-based cleanup failed:', error.message);
    }
  }

  /**
   * Prefetch popular node documentation
   */
  async prefetchPopularNodes() {
    const popularNodes = [
      'nodes-base.slack',
      'nodes-base.httpRequest',
      'nodes-base.webhook',
      'nodes-base.googleSheets',
      'nodes-base.code',
      'nodes-base.if',
      'nodes-base.postgres',
      'nodes-base.gmail'
    ];

    console.log('🚀 Prefetching popular node documentation...');
    
    for (const nodeType of popularNodes) {
      try {
        await this.getNodeDocumentation(nodeType);
        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.warn(`Failed to prefetch ${nodeType}:`, error.message);
      }
    }
    
    console.log('✅ Prefetch complete');
  }

  /**
   * Clear all cache
   */
  async clearCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }
      
      this.metadata = {};
      this.stats = {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        apiCallsSaved: 0,
        tokensSaved: 0,
        costSaved: 0
      };
      
      await this.saveMetadata();
      await this.saveStats();
      
      console.log('🧹 Cache cleared');
    } catch (error) {
      console.error('Failed to clear cache:', error.message);
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * CLI interface
   */
  static async runCLI() {
    const args = process.argv.slice(2);
    const command = args[0];
    const cache = new SmartDocumentationCache();

    if (command === 'get') {
      const [nodeType, ...options] = args.slice(1);
      
      if (!nodeType) {
        console.error('Usage: node docs-cache.js get <node-type> [--force-refresh]');
        process.exit(1);
      }

      try {
        const forceRefresh = options.includes('--force-refresh');
        const result = await cache.getNodeDocumentation(nodeType, { forceRefresh });
        
        console.log('\n📚 Documentation Result:');
        console.log(`Source: ${result.source}`);
        if (result.data) {
          console.log(`Node: ${nodeType}`);
          console.log(`Description: ${result.data.description}`);
          if (result.cachedAt) {
            console.log(`Cached: ${new Date(result.cachedAt).toLocaleString()}`);
          }
        }
        
      } catch (error) {
        console.error('❌ Failed to get documentation:', error.message);
        process.exit(1);
      }

    } else if (command === 'stats') {
      try {
        const stats = await cache.getCacheStats();
        
        console.log('\n📊 Cache Statistics:');
        console.log(`Total Requests: ${stats.totalRequests}`);
        console.log(`Cache Hits: ${stats.cacheHits}`);
        console.log(`Cache Misses: ${stats.cacheMisses}`);
        console.log(`Hit Rate: ${stats.hitRate}`);
        console.log(`Cache Size: ${stats.cacheSize}`);
        console.log(`Entries: ${stats.entryCount}`);
        console.log(`API Calls Saved: ${stats.apiCallsSaved}`);
        console.log(`Estimated Tokens Saved: ${stats.estimatedTokensSaved}`);
        console.log(`Estimated Cost Saved: $${stats.estimatedCostSaved.toFixed(4)}`);
        
      } catch (error) {
        console.error('❌ Failed to get stats:', error.message);
        process.exit(1);
      }

    } else if (command === 'prefetch') {
      try {
        await cache.prefetchPopularNodes();
        console.log('✅ Prefetch completed');
      } catch (error) {
        console.error('❌ Prefetch failed:', error.message);
        process.exit(1);
      }

    } else if (command === 'cleanup') {
      try {
        await cache.cleanup();
        console.log('✅ Cache cleanup completed');
      } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        process.exit(1);
      }

    } else if (command === 'clear') {
      try {
        await cache.clearCache();
        console.log('✅ Cache cleared');
      } catch (error) {
        console.error('❌ Failed to clear cache:', error.message);
        process.exit(1);
      }

    } else {
      console.log('Smart Documentation Cache Manager');
      console.log('');
      console.log('Usage:');
      console.log('  node docs-cache.js get <node-type> [--force-refresh]');
      console.log('  node docs-cache.js stats');
      console.log('  node docs-cache.js prefetch');
      console.log('  node docs-cache.js cleanup');
      console.log('  node docs-cache.js clear');
      console.log('');
      console.log('Examples:');
      console.log('  # Get Slack node documentation');
      console.log('  node docs-cache.js get nodes-base.slack');
      console.log('');
      console.log('  # Force refresh from API');
      console.log('  node docs-cache.js get nodes-base.httpRequest --force-refresh');
      console.log('');
      console.log('  # View cache statistics');
      console.log('  node docs-cache.js stats');
    }
  }
}

// Export for module use
module.exports = {
  SmartDocumentationCache,
  getNodeDocumentation: async (nodeType, options) => {
    const cache = new SmartDocumentationCache();
    return await cache.getNodeDocumentation(nodeType, options);
  },
  getCacheStats: async () => {
    const cache = new SmartDocumentationCache();
    return await cache.getCacheStats();
  }
};

// Run CLI if called directly
if (require.main === module) {
  SmartDocumentationCache.runCLI().catch(console.error);
}

require('dotenv').config();
const fs = require('fs');
const glob = require('glob');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

/**
 * Generate Embeddings Script
 * Creates vector embeddings for workflow discovery and similarity search
 */

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

if (!openaiKey) {
  console.error('❌ Missing OpenAI API key for embeddings generation');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

async function generateWorkflowEmbeddings() {
  console.log('🔍 Generating embeddings for workflow discovery...');
  
  // Find all workflow files
  const workflowFiles = glob.sync('microflows/**/*.json');
  console.log(`Found ${workflowFiles.length} workflow files`);
  
  let processed = 0;
  let errors = 0;
  
  for (const file of workflowFiles) {
    try {
      const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
      
      if (!workflow.workflow_meta?.id) {
        console.warn(`⚠️  Skipping ${file}: Missing workflow_meta.id`);
        continue;
      }
      
      // Create embedding text from workflow metadata
      const embeddingText = [
        workflow.workflow_meta.goal || '',
        workflow.workflow_meta.category || '',
        (workflow.workflow_meta.tags || []).join(' '),
        Object.keys(workflow.inputs?.schema?.properties || {}).join(' '),
        Object.keys(workflow.outputs?.success || {}).join(' ')
      ].filter(Boolean).join(' ');
      
      // Generate embedding using OpenAI
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: embeddingText,
        encoding_format: 'float'
      });
      
      const embedding = response.data[0].embedding;
      
      // Store workflow metadata
      const { error: metaError } = await supabase
        .from('workflow_metadata')
        .upsert({
          id: workflow.workflow_meta.id,
          category: workflow.workflow_meta.category,
          goal: workflow.workflow_meta.goal,
          complexity: workflow.workflow_meta.complexity,
          reuse_potential: workflow.workflow_meta.reuse_potential,
          tags: workflow.workflow_meta.tags || []
        });
      
      if (metaError) {
        console.error(`❌ Error storing metadata for ${workflow.workflow_meta.id}:`, metaError.message);
        errors++;
        continue;
      }
      
      // Store embedding
      const { error: embeddingError } = await supabase
        .from('workflow_embeddings')
        .upsert({
          workflow_id: workflow.workflow_meta.id,
          embedding: embedding
        });
      
      if (embeddingError) {
        console.error(`❌ Error storing embedding for ${workflow.workflow_meta.id}:`, embeddingError.message);
        errors++;
        continue;
      }
      
      console.log(`✅ Processed: ${workflow.workflow_meta.id}`);
      processed++;
      
      // Add small delay to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
      errors++;
    }
  }
  
  console.log(`\n📊 Embedding Generation Summary:`);
  console.log(`   Total files: ${workflowFiles.length}`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Errors: ${errors}`);
  
  if (errors > 0) {
    console.log(`⚠️  ${errors} files had errors - check logs above`);
  } else {
    console.log(`🎉 All embeddings generated successfully!`);
  }
}

async function findSimilarWorkflows(query, threshold = 0.8) {
  console.log(`🔍 Finding workflows similar to: "${query}"`);
  
  try {
    // Generate embedding for query
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float'
    });
    
    const queryEmbedding = response.data[0].embedding;
    
    // Find similar workflows using cosine similarity
    const { data, error } = await supabase.rpc('find_similar_workflows', {
      query_embedding: queryEmbedding,
      similarity_threshold: threshold,
      match_count: 10
    });
    
    if (error) {
      console.error('❌ Error finding similar workflows:', error.message);
      return [];
    }
    
    console.log(`Found ${data.length} similar workflows:`);
    data.forEach(workflow => {
      console.log(`  - ${workflow.id} (similarity: ${workflow.similarity.toFixed(3)})`);
      console.log(`    ${workflow.goal}`);
    });
    
    return data;
    
  } catch (error) {
    console.error('❌ Error in similarity search:', error.message);
    return [];
  }
}

// Main execution
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'search') {
    const query = process.argv.slice(3).join(' ');
    if (!query) {
      console.error('❌ Please provide a search query');
      console.log('Usage: node generate-embeddings.js search "your query here"');
      process.exit(1);
    }
    
    findSimilarWorkflows(query).catch(console.error);
  } else {
    generateWorkflowEmbeddings().catch(console.error);
  }
}

module.exports = { generateWorkflowEmbeddings, findSimilarWorkflows };

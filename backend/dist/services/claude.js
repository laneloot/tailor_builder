"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROVIDER = void 0;
exports.refreshSkillCaches = refreshSkillCaches;
exports.resolveAIProvider = resolveAIProvider;
exports.createTextCompletion = createTextCompletion;
exports.resolvePromptExecutionConfig = resolvePromptExecutionConfig;
exports.shouldUseAnthropicOptimizationsForPrompt = shouldUseAnthropicOptimizationsForPrompt;
exports.createPromptCompletion = createPromptCompletion;
exports.canUseAnthropicBatchForPrompt = canUseAnthropicBatchForPrompt;
exports.batchCreatePromptCompletions = batchCreatePromptCompletions;
exports.analyzeJobDescription = analyzeJobDescription;
exports.buildAnalyzeJobDescriptionPromptValues = buildAnalyzeJobDescriptionPromptValues;
exports.parseJobAnalysisContent = parseJobAnalysisContent;
exports.batchAnalyzeJobDescriptions = batchAnalyzeJobDescriptions;
exports.buildTailorResumePromptValues = buildTailorResumePromptValues;
exports.parseTailoredResumeContent = parseTailoredResumeContent;
exports.tailorResume = tailorResume;
exports.generateCoverLetter = generateCoverLetter;
exports.extractTemplateFromPDF = extractTemplateFromPDF;
exports.extractProfileFromResume = extractProfileFromResume;
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const promptService_1 = require("./promptService");
const aiModelConfig_1 = require("../config/aiModelConfig");
const skillsDatabase_1 = require("../database/skillsDatabase");
const array_1 = require("../utils/array");
const json_1 = require("../utils/json");
const resumeBuilder_1 = require("./utils/resumeBuilder");
const config_1 = require("./utils/config");
const aiModelCatalog_1 = require("./aiModelCatalog");
// Ensure the repo .env file is loaded for this module even when it is imported
// before index.ts finishes bootstrapping, and prefer .env over inherited shell vars.
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../../.env'), override: true });
const technicalSkills = (0, skillsDatabase_1.readSkills)('hard');
const softSkills = (0, skillsDatabase_1.readSkills)('soft');
let hardSkillPriorityMap = (0, skillsDatabase_1.readHardSkillPriorityMap)();
function refreshSkillCaches() {
    const nextTech = (0, skillsDatabase_1.readSkills)('hard');
    const nextSoft = (0, skillsDatabase_1.readSkills)('soft');
    const nextHardSkillPriorityMap = (0, skillsDatabase_1.readHardSkillPriorityMap)();
    technicalSkills.length = 0;
    technicalSkills.push(...nextTech);
    softSkills.length = 0;
    softSkills.push(...nextSoft);
    hardSkillPriorityMap = nextHardSkillPriorityMap;
}
// Lazy initialization to ensure env vars are loaded first
let openaiClient = null;
let openaiClientKey = '';
let anthropicCacheUsageWarningShown = false;
function extractTechSkills(text) {
    return technicalSkills.filter((item) => {
        const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = item === "Go"
            ? new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`) // case-sensitive
            : new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i"); // case-insensitive
        return regex.test(text);
    });
}
function extractSoftSkills(text) {
    return softSkills.filter((item) => {
        const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i");
        return regex.test(text);
    });
}
function getTailoringSourceText(jobAnalysis) {
    const directSource = jobAnalysis?.sourceJobDescription?.trim();
    if (directSource) {
        return directSource;
    }
    return [
        getJobAnalysisTitle(jobAnalysis),
        ...getRequiredSkills(jobAnalysis),
        ...getPreferredSkills(jobAnalysis),
        ...getSkillTools(jobAnalysis),
        ...getSkillTechnologies(jobAnalysis),
        ...getKeywordChecklist(jobAnalysis),
        ...getResponsibilities(jobAnalysis),
        ...getDomainKnowledge(jobAnalysis),
        ...getSoftSkills(jobAnalysis),
    ]
        .filter((value) => value.trim().length > 0)
        .join('\n');
}
function reconcileSkillBuckets({ extractedSkills, modelSkills, referenceSkills, supplementSkills, minimumCount, finalizeSkills, }) {
    const confirmedSkills = [...extractedSkills];
    const unconfirmedSkills = [...modelSkills];
    (0, array_1.moveCaseInsensitiveMatches)(referenceSkills, unconfirmedSkills, confirmedSkills);
    const uniqueConfirmedSkills = (0, array_1.uniqueCaseInsensitive)((0, resumeBuilder_1.ensureMinTechSkills)((0, resumeBuilder_1.removeDuplicateSubstrings)((0, array_1.uniqueCaseInsensitive)(confirmedSkills)), supplementSkills, minimumCount));
    return {
        confirmedSkills: finalizeSkills ? finalizeSkills(uniqueConfirmedSkills) : uniqueConfirmedSkills,
        unconfirmedSkills: (0, array_1.uniqueCaseInsensitive)(unconfirmedSkills),
    };
}
function capitalizeFirstCharacter(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return trimmed;
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
const DEFAULT_PROVIDER = 'openai';
exports.DEFAULT_PROVIDER = DEFAULT_PROVIDER;
const ANTHROPIC_MAX_RETRIES = 4;
const ANTHROPIC_BASE_RETRY_DELAY_MS = 600;
const MIN_ROLE_BRIEF_LENGTH = 320;
const MAX_ROLE_BRIEF_LENGTH = 900;
const MAX_HARD_SKILLS = 25;
const MAX_HARD_SKILLS_PER_CATEGORY = 5;
const MAX_SOFT_SKILLS = 10;
const SOFT_SKILL_SIGNALS = [
    'accountability',
    'communication',
    'collaboration',
    'mindset',
    'mentality',
    'ownership',
    'reliability',
    'resilient',
    'supportive',
    'eager to learn',
    'adaptability',
    'autonomy',
    'independent',
    'self-directed',
    'adapt',
    'ambiguity',
    'passion',
    'attention to detail',
    'team player',
    'cross-functional',
    'stakeholder',
    'leadership',
    'problem-solving',
    'product-minded',
    'driving clarity',
    'transparency',
];
const ATS_SOFT_SKILL_RULES = [
    { canonical: 'Reliability', patterns: ['reliability', 'reliable'] },
    { canonical: 'Resilient', patterns: ['resilient', 'resilience'] },
    { canonical: 'Supportive', patterns: ['supportive', 'support'] },
    { canonical: 'Communication', patterns: ['communication', 'communicate'] },
    { canonical: 'Collaboration skills', patterns: ['collaboration', 'collaborative'] },
    { canonical: 'Cross-functional team', patterns: ['cross-functional', 'cross functional'] },
    { canonical: 'Strong problem-solving skills', patterns: ['problem-solving', 'problem solving'] },
    { canonical: 'Eager to learn', patterns: ['eager to learn', 'lifelong learning'] },
    { canonical: 'Accountability', patterns: ['accountability', 'accountable'] },
];
// const HARD_SKILL_PRIORITY_SIGNALS = [
//   'ai',
//   'ruby',
//   'sre',
//   'cloud infrastructure',
//   'cloud technologies',
//   'automation',
//   'aws',
//   'kubernetes',
//   'docker',
//   'linux',
//   'infrastructure as code',
//   'iac',
//   'devops',
//   'ci/cd',
//   'terraform',
//   'monitoring',
//   'observability',
//   'bash scripting',
//   'troubleshoot',
//   'log analysis',
//   'server-side',
//   'abstraction',
//   'debugging',
//   'aws cloud',
//   'tooling',
//   'version control',
// ];
const HARD_SKILL_RULES = [
    { canonical: 'Bash scripting', patterns: ['bash scripting', 'bash'] },
    { canonical: 'Troubleshoot', patterns: ['troubleshoot', 'troubleshooting'] },
    { canonical: 'Log analysis', patterns: ['log analysis', 'logging'] },
    { canonical: 'Server-side', patterns: ['server-side', 'server side'] },
    { canonical: 'Abstraction', patterns: ['abstraction'] },
    { canonical: 'Debugging', patterns: ['debugging', 'debug'] },
    { canonical: 'AWS cloud', patterns: ['aws cloud', 'aws'] },
    { canonical: 'Tooling', patterns: ['tooling', 'tools'] },
    { canonical: 'Version control', patterns: ['version control', 'git'] },
];
const HARD_SKILL_CATEGORY_ORDER = [
    'backend',
    'frontend',
    'databases',
    'cloud-devops',
    'testing-automation',
    'ai-ml',
    'tools-methodologies',
    'other',
];
const HARD_SKILL_CATEGORY_SEEDS = [
    {
        category: 'backend',
        skills: [
            { display: 'Python', aliases: ['python'] },
            { display: 'FastAPI', aliases: ['fastapi', 'fast api'] },
            { display: 'Django', aliases: ['django'] },
            { display: 'Django REST Framework', aliases: ['django rest framework', 'drf'] },
            { display: 'Flask', aliases: ['flask'] },
            { display: 'Pydantic', aliases: ['pydantic'] },
            { display: 'Node.js', aliases: ['node.js', 'nodejs', 'node'] },
            { display: 'Express.js', aliases: ['express.js', 'expressjs', 'express'] },
            { display: 'NestJS', aliases: ['nestjs', 'nest.js', 'nest'] },
            { display: 'Fastify', aliases: ['fastify'] },
            { display: 'Koa', aliases: ['koa'] },
            { display: 'Ruby on Rails', aliases: ['ruby on rails', 'rails'] },
            { display: 'Go', aliases: ['go', 'golang'] },
            { display: 'Gin', aliases: ['gin'] },
            { display: 'Echo', aliases: ['echo'] },
            { display: 'Java', aliases: ['java'] },
            { display: 'Spring Boot', aliases: ['spring boot', 'springboot'] },
            { display: 'Spring Framework', aliases: ['spring framework', 'spring'] },
            { display: 'C#', aliases: ['c#'] },
            { display: '.NET Core', aliases: ['.net core', 'dotnet core'] },
            { display: 'PHP', aliases: ['php'] },
            { display: 'Laravel', aliases: ['laravel'] },
            { display: 'Symfony', aliases: ['symfony'] },
            { display: 'Microservices Architecture', aliases: ['microservices architecture', 'microservices', 'microservice architecture'] },
            { display: 'Event-Driven Architecture', aliases: ['event-driven architecture', 'event driven architecture'] },
            { display: 'Domain-Driven Design (DDD)', aliases: ['domain-driven design', 'domain driven design', 'ddd'] },
            { display: 'gRPC', aliases: ['grpc'] },
            { display: 'WebSockets', aliases: ['websockets', 'websocket'] },
            { display: 'Server-Sent Events', aliases: ['server-sent events', 'server sent events', 'sse'] },
            { display: 'Celery', aliases: ['celery'] },
            { display: 'RabbitMQ', aliases: ['rabbitmq'] },
            { display: 'Apache Kafka', aliases: ['apache kafka', 'kafka'] },
            { display: 'RESTful APIs', aliases: ['restful apis', 'restful api', 'rest apis', 'rest api'] },
            { display: 'GraphQL', aliases: ['graphql'] },
            { display: 'Asynchronous Processing', aliases: ['asynchronous processing', 'async processing'] },
            { display: 'API Gateway Design', aliases: ['api gateway design', 'api gateway'] },
            { display: 'Serverless Functions', aliases: ['serverless functions', 'serverless function'] },
            { display: 'Background Jobs', aliases: ['background jobs', 'background job'] },
            { display: 'Message Queues', aliases: ['message queues', 'message queue'] },
        ],
    },
    {
        category: 'frontend',
        skills: [
            { display: 'React.js', aliases: ['react.js', 'reactjs', 'react'] },
            { display: 'React Hooks', aliases: ['react hooks', 'react hook'] },
            { display: 'Angular', aliases: ['angular'] },
            { display: 'Vue.js', aliases: ['vue.js', 'vuejs', 'vue'] },
            { display: 'Next.js', aliases: ['next.js', 'nextjs', 'next'] },
            { display: 'Nuxt.js', aliases: ['nuxt.js', 'nuxtjs', 'nuxt'] },
            { display: 'TypeScript', aliases: ['typescript', 'ts'] },
            { display: 'JavaScript', aliases: ['javascript', 'js', 'javascript (es6+)', 'es6+'] },
            { display: 'Redux', aliases: ['redux'] },
            { display: 'Redux Toolkit', aliases: ['redux toolkit'] },
            { display: 'Zustand', aliases: ['zustand'] },
            { display: 'MobX', aliases: ['mobx'] },
            { display: 'RxJS', aliases: ['rxjs'] },
            { display: 'HTML5', aliases: ['html5', 'html'] },
            { display: 'CSS3', aliases: ['css3', 'css'] },
            { display: 'SCSS', aliases: ['scss'] },
            { display: 'SASS', aliases: ['sass'] },
            { display: 'TailwindCSS', aliases: ['tailwindcss', 'tailwind css', 'tailwind'] },
            { display: 'Bootstrap', aliases: ['bootstrap'] },
            { display: 'Material UI (MUI)', aliases: ['material ui', 'material-ui', 'mui'] },
            { display: 'Ant Design', aliases: ['ant design', 'antd'] },
            { display: 'Chakra UI', aliases: ['chakra ui', 'chakra-ui'] },
            { display: 'Styled Components', aliases: ['styled components', 'styled-components'] },
            { display: 'Emotion', aliases: ['emotion'] },
            { display: 'Chart.js', aliases: ['chart.js', 'chartjs'] },
            { display: 'D3.js', aliases: ['d3.js', 'd3js', 'd3'] },
            { display: 'Three.js', aliases: ['three.js', 'threejs'] },
            { display: 'Responsive Design', aliases: ['responsive design'] },
            { display: 'Mobile-First Design', aliases: ['mobile-first design', 'mobile first design'] },
            { display: 'Progressive Web Apps (PWA)', aliases: ['progressive web apps', 'progressive web app', 'pwa'] },
            { display: 'Webpack', aliases: ['webpack'] },
            { display: 'Vite', aliases: ['vite'] },
            { display: 'Rollup', aliases: ['rollup'] },
            { display: 'Babel', aliases: ['babel'] },
            { display: 'ESLint', aliases: ['eslint', 'es lint'] },
            { display: 'Prettier', aliases: ['prettier'] },
        ],
    },
    {
        category: 'databases',
        skills: [
            { display: 'PostgreSQL', aliases: ['postgresql', 'postgres', 'psql'] },
            { display: 'MySQL', aliases: ['mysql'] },
            { display: 'SQL Server', aliases: ['sql server', 'mssql'] },
            { display: 'Oracle Database', aliases: ['oracle database', 'oracle'] },
            { display: 'MongoDB', aliases: ['mongodb', 'mongo'] },
            { display: 'DynamoDB', aliases: ['dynamodb'] },
            { display: 'Cassandra', aliases: ['cassandra'] },
            { display: 'CouchDB', aliases: ['couchdb'] },
            { display: 'Redis', aliases: ['redis'] },
            { display: 'Memcached', aliases: ['memcached'] },
            { display: 'Firebase Firestore', aliases: ['firebase firestore', 'firestore'] },
            { display: 'Elasticsearch', aliases: ['elasticsearch', 'elastic search'] },
            { display: 'Apache Solr', aliases: ['apache solr', 'solr'] },
            { display: 'InfluxDB', aliases: ['influxdb'] },
            { display: 'TimescaleDB', aliases: ['timescaledb'] },
            { display: 'Neo4j', aliases: ['neo4j'] },
            { display: 'ETL Pipelines', aliases: ['etl pipelines', 'etl pipeline', 'etl'] },
            { display: 'Data Warehousing', aliases: ['data warehousing', 'data warehouse'] },
            { display: 'Data Lakes', aliases: ['data lakes', 'data lake'] },
            { display: 'SQLAlchemy', aliases: ['sqlalchemy'] },
            { display: 'Prisma', aliases: ['prisma'] },
            { display: 'TypeORM', aliases: ['typeorm'] },
            { display: 'Sequelize', aliases: ['sequelize'] },
            { display: 'Mongoose', aliases: ['mongoose'] },
            { display: 'ActiveRecord', aliases: ['activerecord', 'active record'] },
            { display: 'Query Optimization', aliases: ['query optimization', 'query optimisation'] },
            { display: 'Database Indexing', aliases: ['database indexing', 'indexing'] },
            { display: 'Sharding', aliases: ['sharding'] },
            { display: 'Replication', aliases: ['replication'] },
            { display: 'Data Modeling', aliases: ['data modeling', 'data modelling'] },
            { display: 'Data Caching', aliases: ['data caching'] },
            { display: 'Database Migration', aliases: ['database migration', 'database migrations'] },
            { display: 'ACID Transactions', aliases: ['acid transactions', 'acid transaction', 'acid'] },
        ],
    },
    {
        category: 'cloud-devops',
        skills: [
            { display: 'AWS', aliases: ['aws', 'amazon web services'] },
            { display: 'AWS Lambda', aliases: ['aws lambda', 'lambda'] },
            { display: 'Amazon EKS', aliases: ['amazon eks', 'eks'] },
            { display: 'Amazon ECS', aliases: ['amazon ecs', 'ecs'] },
            { display: 'AWS Fargate', aliases: ['aws fargate', 'fargate'] },
            { display: 'Amazon EC2', aliases: ['amazon ec2', 'ec2'] },
            { display: 'Amazon S3', aliases: ['amazon s3', 's3'] },
            { display: 'Amazon CloudFront', aliases: ['amazon cloudfront', 'cloudfront'] },
            { display: 'Amazon RDS', aliases: ['amazon rds', 'rds'] },
            { display: 'Amazon API Gateway', aliases: ['amazon api gateway', 'api gateway'] },
            { display: 'CloudWatch', aliases: ['cloudwatch'] },
            { display: 'SageMaker', aliases: ['sagemaker'] },
            { display: 'Step Functions', aliases: ['step functions', 'aws step functions'] },
            { display: 'SNS', aliases: ['sns', 'amazon sns'] },
            { display: 'SQS', aliases: ['sqs', 'amazon sqs'] },
            { display: 'IAM', aliases: ['iam', 'aws iam'] },
            { display: 'VPC', aliases: ['vpc', 'amazon vpc'] },
            { display: 'Route 53', aliases: ['route 53', 'route53'] },
            { display: 'Google Cloud Platform (GCP)', aliases: ['google cloud platform', 'gcp', 'google cloud'] },
            { display: 'Microsoft Azure', aliases: ['microsoft azure', 'azure'] },
            { display: 'Docker', aliases: ['docker'] },
            { display: 'Docker Compose', aliases: ['docker compose'] },
            { display: 'Kubernetes', aliases: ['kubernetes', 'k8s', 'kube'] },
            { display: 'Helm', aliases: ['helm'] },
            { display: 'OpenShift', aliases: ['openshift'] },
            { display: 'Terraform', aliases: ['terraform'] },
            { display: 'CloudFormation', aliases: ['cloudformation', 'aws cloudformation'] },
            { display: 'Ansible', aliases: ['ansible'] },
            { display: 'Puppet', aliases: ['puppet'] },
            { display: 'Chef', aliases: ['chef'] },
            { display: 'GitHub Actions', aliases: ['github actions'] },
            { display: 'Jenkins', aliases: ['jenkins'] },
            { display: 'GitLab CI/CD', aliases: ['gitlab ci/cd', 'gitlab ci'] },
            { display: 'CircleCI', aliases: ['circleci', 'circle ci'] },
            { display: 'Travis CI', aliases: ['travis ci'] },
            { display: 'ArgoCD', aliases: ['argocd', 'argo cd'] },
            { display: 'Flux', aliases: ['flux'] },
            { display: 'CI/CD Pipelines', aliases: ['ci/cd pipelines', 'ci/cd pipeline', 'cicd pipelines'] },
            { display: 'Infrastructure as Code (IaC)', aliases: ['infrastructure as code', 'iac'] },
            { display: 'Grafana', aliases: ['grafana'] },
            { display: 'Prometheus', aliases: ['prometheus'] },
            { display: 'Datadog', aliases: ['datadog'] },
            { display: 'New Relic', aliases: ['new relic'] },
            { display: 'ELK Stack', aliases: ['elk stack', 'elk'] },
            { display: 'Istio', aliases: ['istio'] },
            { display: 'Linkerd', aliases: ['linkerd'] },
            { display: 'Load Balancing', aliases: ['load balancing', 'load balancer'] },
            { display: 'Auto Scaling', aliases: ['auto scaling', 'auto-scaling'] },
        ],
    },
    {
        category: 'testing-automation',
        skills: [
            { display: 'PyTest', aliases: ['pytest', 'py test'] },
            { display: 'Jest', aliases: ['jest'] },
            { display: 'JUnit', aliases: ['junit'] },
            { display: 'TestNG', aliases: ['testng'] },
            { display: 'Mocha', aliases: ['mocha'] },
            { display: 'Chai', aliases: ['chai'] },
            { display: 'Jasmine', aliases: ['jasmine'] },
            { display: 'Cypress', aliases: ['cypress'] },
            { display: 'Playwright', aliases: ['playwright'] },
            { display: 'Selenium', aliases: ['selenium'] },
            { display: 'Puppeteer', aliases: ['puppeteer'] },
            { display: 'WebDriverIO', aliases: ['webdriverio', 'webdriver io'] },
            { display: 'Postman', aliases: ['postman'] },
            { display: 'Insomnia', aliases: ['insomnia'] },
            { display: 'REST Assured', aliases: ['rest assured'] },
            { display: 'Locust', aliases: ['locust'] },
            { display: 'k6', aliases: ['k6'] },
            { display: 'JMeter', aliases: ['jmeter'] },
            { display: 'Artillery', aliases: ['artillery'] },
            { display: 'Unit Testing', aliases: ['unit testing'] },
            { display: 'Integration Testing', aliases: ['integration testing'] },
            { display: 'End-to-End Testing (E2E)', aliases: ['end-to-end testing', 'end to end testing', 'e2e'] },
            { display: 'API Testing', aliases: ['api testing'] },
            { display: 'Test-Driven Development (TDD)', aliases: ['test-driven development', 'test driven development', 'tdd'] },
            { display: 'Behavior-Driven Development (BDD)', aliases: ['behavior-driven development', 'behaviour-driven development', 'bdd'] },
            { display: 'Performance Testing', aliases: ['performance testing'] },
            { display: 'Security Testing', aliases: ['security testing'] },
            { display: 'Penetration Testing', aliases: ['penetration testing', 'pen testing', 'pentesting'] },
            { display: 'Code Coverage', aliases: ['code coverage'] },
            { display: 'SonarQube', aliases: ['sonarqube', 'sonar qube'] },
            { display: 'Quality Assurance', aliases: ['quality assurance', 'qa'] },
            { display: 'Test Automation Frameworks', aliases: ['test automation frameworks', 'test automation framework'] },
        ],
    },
    {
        category: 'ai-ml',
        skills: [
            { display: 'OpenAI GPT APIs', aliases: ['openai gpt apis', 'openai api', 'gpt api', 'gpt apis'] },
            { display: 'ChatGPT', aliases: ['chatgpt'] },
            { display: 'Claude API', aliases: ['claude api', 'anthropic api'] },
            { display: 'LangChain', aliases: ['langchain'] },
            { display: 'LlamaIndex', aliases: ['llamaindex', 'llama index'] },
            { display: 'Hugging Face Transformers', aliases: ['hugging face transformers', 'transformers', 'huggingface transformers'] },
            { display: 'TensorFlow', aliases: ['tensorflow', 'tensor flow'] },
            { display: 'PyTorch', aliases: ['pytorch', 'py torch'] },
            { display: 'Keras', aliases: ['keras'] },
            { display: 'Scikit-learn', aliases: ['scikit-learn', 'sklearn'] },
            { display: 'XGBoost', aliases: ['xgboost'] },
            { display: 'LightGBM', aliases: ['lightgbm'] },
            { display: 'SpaCy', aliases: ['spacy'] },
            { display: 'NLTK', aliases: ['nltk'] },
            { display: 'Pandas', aliases: ['pandas'] },
            { display: 'NumPy', aliases: ['numpy'] },
            { display: 'Matplotlib', aliases: ['matplotlib'] },
            { display: 'Seaborn', aliases: ['seaborn'] },
            { display: 'Jupyter Notebooks', aliases: ['jupyter notebooks', 'jupyter notebook', 'jupyter'] },
            { display: 'FastAPI AI Agents', aliases: ['fastapi ai agents', 'fastapi ai agent'] },
            { display: 'Prompt Engineering', aliases: ['prompt engineering'] },
            { display: 'Model Fine-tuning', aliases: ['model fine-tuning', 'model fine tuning', 'fine-tuning', 'fine tuning'] },
            { display: 'RAG (Retrieval-Augmented Generation)', aliases: ['rag', 'retrieval-augmented generation', 'retrieval augmented generation'] },
            { display: 'Pinecone', aliases: ['pinecone'] },
            { display: 'Chroma', aliases: ['chroma'] },
            { display: 'Weaviate', aliases: ['weaviate'] },
            { display: 'MLOps', aliases: ['mlops'] },
            { display: 'Model Deployment', aliases: ['model deployment'] },
            { display: 'Computer Vision', aliases: ['computer vision'] },
            { display: 'Natural Language Processing (NLP)', aliases: ['natural language processing', 'nlp'] },
            { display: 'Deep Learning', aliases: ['deep learning'] },
            { display: 'Machine Learning', aliases: ['machine learning', 'ml'] },
        ],
    },
    {
        category: 'tools-methodologies',
        skills: [
            { display: 'Git', aliases: ['git'] },
            { display: 'GitHub', aliases: ['github'] },
            { display: 'GitLab', aliases: ['gitlab'] },
            { display: 'Bitbucket', aliases: ['bitbucket'] },
            { display: 'Jira', aliases: ['jira'] },
            { display: 'Asana', aliases: ['asana'] },
            { display: 'Trello', aliases: ['trello'] },
            { display: 'Linear', aliases: ['linear'] },
            { display: 'Monday.com', aliases: ['monday.com', 'monday'] },
            { display: 'Confluence', aliases: ['confluence'] },
            { display: 'Notion', aliases: ['notion'] },
            { display: 'Swagger/OpenAPI', aliases: ['swagger/openapi', 'swagger', 'openapi'] },
            { display: 'Figma', aliases: ['figma'] },
            { display: 'Sketch', aliases: ['sketch'] },
            { display: 'Adobe XD', aliases: ['adobe xd', 'xd'] },
            { display: 'VSCode', aliases: ['vscode', 'vs code'] },
            { display: 'PyCharm', aliases: ['pycharm'] },
            { display: 'IntelliJ IDEA', aliases: ['intellij idea', 'intellij'] },
            { display: 'WebStorm', aliases: ['webstorm'] },
            { display: 'Sublime Text', aliases: ['sublime text', 'sublime'] },
            { display: 'Vim', aliases: ['vim'] },
            { display: 'Agile', aliases: ['agile'] },
            { display: 'Scrum', aliases: ['scrum'] },
            { display: 'Kanban', aliases: ['kanban'] },
            { display: 'DevOps', aliases: ['devops'] },
            { display: 'Microservices', aliases: ['microservices'] },
            { display: 'Clean Architecture', aliases: ['clean architecture'] },
            { display: 'SOLID Principles', aliases: ['solid principles', 'solid'] },
            { display: 'Design Patterns', aliases: ['design patterns', 'design pattern'] },
            { display: 'Code Review', aliases: ['code review', 'code reviews'] },
            { display: 'Pair Programming', aliases: ['pair programming'] },
            { display: 'npm', aliases: ['npm'] },
            { display: 'yarn', aliases: ['yarn'] },
            { display: 'pip', aliases: ['pip'] },
            { display: 'poetry', aliases: ['poetry'] },
            { display: 'Maven', aliases: ['maven'] },
            { display: 'Gradle', aliases: ['gradle'] },
        ],
    },
];
const HARD_SKILL_DEFINITIONS = HARD_SKILL_CATEGORY_SEEDS.flatMap(({ category, skills }) => skills.map((skill, index) => ({
    display: skill.display,
    category,
    aliases: (0, array_1.uniqueCaseInsensitive)([skill.display, ...(skill.aliases ?? [])]).map(normalizeHardSkillAlias),
    priority: index,
})));
const HARD_SKILL_ALIAS_MAP = new Map();
for (const definition of HARD_SKILL_DEFINITIONS) {
    for (const alias of definition.aliases) {
        HARD_SKILL_ALIAS_MAP.set(alias, {
            display: definition.display,
            category: definition.category,
            priority: definition.priority,
        });
    }
}
const HARD_SKILL_CATEGORY_WEIGHT = {
    backend: 0,
    frontend: 1,
    databases: 2,
    'cloud-devops': 3,
    'testing-automation': 4,
    'ai-ml': 5,
    'tools-methodologies': 6,
    other: 7,
};
const JSON_ONLY_SYSTEM_PROMPT = 'You are a strict JSON generator. Return valid JSON only, with no markdown fences or extra text.';
const TAILOR_RESUME_PROMPT_ID = 'tailor-resume';
function resolveAIProvider(model) {
    if (model === 'openai' || model?.startsWith('gpt-')) {
        return 'openai';
    }
    if (model === 'claude' || model?.startsWith('claude-')) {
        return 'claude';
    }
    if (model === 'openrouter' || model?.startsWith('openrouter/')) {
        return 'openrouter';
    }
    return DEFAULT_PROVIDER;
}
async function getOpenAIClient() {
    const apiKey = await (0, aiModelConfig_1.getProviderApiKey)('openai');
    if (!apiKey) {
        throw new Error('OpenAI API key is not set');
    }
    if (!openaiClient || openaiClientKey !== apiKey) {
        openaiClient = new openai_1.default({
            apiKey,
        });
        openaiClientKey = apiKey;
    }
    return openaiClient;
}
async function createOpenRouterCompletion(input) {
    const apiKey = await (0, aiModelConfig_1.getProviderApiKey)('openrouter');
    if (!apiKey) {
        throw new Error('OpenRouter API key is not set');
    }
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:3001',
            'X-Title': process.env.OPENROUTER_APP_NAME || 'Tailored Resume Builder',
        },
        body: JSON.stringify({
            model: input.model,
            max_tokens: input.maxTokens,
            temperature: input.temperature,
            top_p: 1,
            ...(input.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
            messages: input.messages,
        }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (typeof rawContent === 'string' && rawContent.trim()) {
        return rawContent;
    }
    if (Array.isArray(rawContent)) {
        const text = rawContent
            .filter((item) => item?.type === 'text' && typeof item.text === 'string')
            .map((item) => item.text ?? '')
            .join('')
            .trim();
        if (text) {
            return text;
        }
    }
    throw new Error('Unexpected response from OpenRouter');
}
async function createOpenAIChatCompletion(input) {
    const response = await (await getOpenAIClient()).chat.completions.create({
        model: input.model,
        max_completion_tokens: input.maxTokens,
        temperature: input.temperature,
        top_p: 1,
        ...(input.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
        messages: input.messages,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
        throw new Error('Unexpected response from OpenAI');
    }
    return content;
}
async function createAnthropicMessage(prompt, maxTokens, temperature = 0, modelName = aiModelCatalog_1.DEFAULT_CLAUDE_MODEL) {
    return createAnthropicStructuredMessage({
        model: modelName,
        max_tokens: maxTokens,
        temperature,
        messages: [
            {
                role: 'user',
                content: prompt,
            },
        ],
    }, { logCacheUsage: false });
}
async function createAnthropicStructuredMessage(request, options) {
    const apiKey = await (0, aiModelConfig_1.getProviderApiKey)('claude');
    if (!apiKey) {
        throw new Error('Claude API key is not set');
    }
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const getRetryDelayMs = (attempt, retryAfterHeader) => {
        // Honor provider hint when present, otherwise use capped exponential backoff with jitter.
        const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
            return Math.min(Math.round(retryAfterSeconds * 1000), 15000);
        }
        const exponential = ANTHROPIC_BASE_RETRY_DELAY_MS * (2 ** (attempt - 1));
        const jitter = Math.round(Math.random() * 300);
        return Math.min(exponential + jitter, 15000);
    };
    const isRetriableStatus = (status) => status === 429 || status === 529 || (status >= 500 && status < 600);
    let lastError = null;
    for (let attempt = 1; attempt <= ANTHROPIC_MAX_RETRIES; attempt++) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify(request),
            });
            if (!response.ok) {
                const errorText = await response.text();
                const error = new Error(`Anthropic API error (${response.status}): ${errorText}`);
                if (!isRetriableStatus(response.status) || attempt === ANTHROPIC_MAX_RETRIES) {
                    throw error;
                }
                const delayMs = getRetryDelayMs(attempt, response.headers.get('retry-after'));
                console.warn(`Anthropic returned ${response.status} (attempt ${attempt}/${ANTHROPIC_MAX_RETRIES}); retrying in ${delayMs}ms.`);
                await sleep(delayMs);
                continue;
            }
            const data = await response.json();
            const textBlock = data.content?.find((block) => block.type === 'text' && typeof block.text === 'string');
            if (!textBlock?.text) {
                throw new Error('Unexpected response from Anthropic');
            }
            if (options?.logCacheUsage && data.usage && !anthropicCacheUsageWarningShown) {
                anthropicCacheUsageWarningShown = true;
                console.info(`Anthropic prompt caching usage: read=${data.usage.cache_read_input_tokens ?? 0}, created=${data.usage.cache_creation_input_tokens ?? 0}, uncached=${data.usage.input_tokens ?? 0}`);
            }
            return textBlock.text;
        }
        catch (error) {
            const maybeError = error instanceof Error ? error : new Error(String(error));
            lastError = maybeError;
            const isLastAttempt = attempt === ANTHROPIC_MAX_RETRIES;
            const isNetworkFailure = maybeError.name === 'TypeError' || maybeError.message.toLowerCase().includes('fetch failed');
            if (!isNetworkFailure || isLastAttempt) {
                throw maybeError;
            }
            const delayMs = getRetryDelayMs(attempt, null);
            console.warn(`Anthropic request failed due to network issue (attempt ${attempt}/${ANTHROPIC_MAX_RETRIES}); retrying in ${delayMs}ms.`);
            await sleep(delayMs);
        }
    }
    throw lastError ?? new Error('Anthropic request failed');
}
function toAnthropicCacheControl(ttl) {
    if (!ttl)
        return undefined;
    return ttl === '1h'
        ? { type: 'ephemeral', ttl: '1h' }
        : { type: 'ephemeral' };
}
async function getPromptContentOrThrow(promptId) {
    const prompt = await (0, promptService_1.getPromptById)(promptId);
    const content = prompt?.content?.trim();
    if (!content) {
        throw new Error(`Prompt "${promptId}" was not found or has no content.`);
    }
    return content;
}
function getPromptValue(values, key, fallback) {
    const value = values[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}
function buildTailorResumeCandidateProfileBlock(values) {
    return [
        'CANDIDATE PROFILE:',
        getPromptValue(values, 'profileJson', '{}'),
    ].join('\n');
}
function buildTailorResumeUserMessage(values) {
    return [
        'JOB ANALYSIS:',
        getPromptValue(values, 'jobAnalysisJson', '{}'),
        '',
        'HARD_SKILLS:',
        getPromptValue(values, 'hardSkillsJSON', '[]'),
        '',
        'KEYWORDS:',
        getPromptValue(values, 'keywordsJson', '[]'),
        '',
        'KEY_RESPONSIBILITIES:',
        getPromptValue(values, 'keyResponsibilitiesJson', '[]'),
        '',
        'DOMAIN_KNOWLEDGE:',
        getPromptValue(values, 'domainKnowledge', '[]'),
        '',
        'SOFT_SKILLS:',
        getPromptValue(values, 'softSkillsJSON', '[]'),
    ].join('\n');
}
async function buildTailorResumeChatMessages(values, responseFormat) {
    const messages = [];
    if (responseFormat === 'json') {
        messages.push({
            role: 'system',
            content: JSON_ONLY_SYSTEM_PROMPT,
        });
    }
    messages.push({
        role: 'system',
        content: await getPromptContentOrThrow(TAILOR_RESUME_PROMPT_ID),
    });
    messages.push({
        role: 'system',
        content: buildTailorResumeCandidateProfileBlock(values),
    });
    messages.push({
        role: 'user',
        content: buildTailorResumeUserMessage(values),
    });
    return messages;
}
async function buildAnthropicTailorResumePromptRequest(input) {
    const systemBlocks = [];
    if (input.responseFormat === 'json') {
        systemBlocks.push({
            type: 'text',
            text: JSON_ONLY_SYSTEM_PROMPT,
        });
    }
    systemBlocks.push({
        type: 'text',
        text: await getPromptContentOrThrow(TAILOR_RESUME_PROMPT_ID),
        cache_control: toAnthropicCacheControl(input.cacheTtl),
    });
    systemBlocks.push({
        type: 'text',
        text: buildTailorResumeCandidateProfileBlock(input.values),
        cache_control: toAnthropicCacheControl(input.cacheTtl),
    });
    return {
        model: input.modelName,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        system: systemBlocks,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: buildTailorResumeUserMessage(input.values),
                    },
                ],
            },
        ],
    };
}
async function buildAnthropicPromptRequest(input) {
    if (input.promptId === TAILOR_RESUME_PROMPT_ID) {
        return buildAnthropicTailorResumePromptRequest(input);
    }
    const segments = await (0, promptService_1.renderPromptSegments)(input.promptId, input.values);
    const systemBlocks = [];
    if (input.responseFormat === 'json') {
        systemBlocks.push({
            type: 'text',
            text: JSON_ONLY_SYSTEM_PROMPT,
        });
    }
    let leadingLiteralIndex = 0;
    let leadingLiteralText = '';
    while (leadingLiteralIndex < segments.length && !segments[leadingLiteralIndex].variableName) {
        leadingLiteralText += segments[leadingLiteralIndex].text;
        leadingLiteralIndex += 1;
    }
    if (leadingLiteralText.trim()) {
        systemBlocks.push({
            type: 'text',
            text: leadingLiteralText,
            cache_control: toAnthropicCacheControl(input.cacheTtl),
        });
    }
    const userBlocks = [];
    for (const segment of segments.slice(leadingLiteralIndex)) {
        if (!segment.text) {
            continue;
        }
        const previous = userBlocks[userBlocks.length - 1];
        if (previous && !previous.cache_control) {
            previous.text += segment.text;
        }
        else {
            userBlocks.push({
                type: 'text',
                text: segment.text,
            });
        }
    }
    if (userBlocks.length === 0) {
        userBlocks.push({
            type: 'text',
            text: leadingLiteralText || ' ',
        });
    }
    return {
        model: input.modelName,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        ...(systemBlocks.length > 0 ? { system: systemBlocks } : {}),
        messages: [
            {
                role: 'user',
                content: userBlocks,
            },
        ],
    };
}
async function createAnthropicPromptCompletion(input) {
    const request = await buildAnthropicPromptRequest({
        promptId: input.promptId,
        values: input.values,
        maxTokens: input.maxTokens ?? 4000,
        temperature: input.temperature ?? 0,
        responseFormat: input.responseFormat ?? 'json',
        modelName: input.modelName || aiModelCatalog_1.DEFAULT_CLAUDE_MODEL,
        cacheTtl: input.cacheTtl,
    });
    return createAnthropicStructuredMessage(request, { logCacheUsage: Boolean(input.cacheTtl) });
}
async function createAnthropicMessageBatch(requests) {
    const apiKey = await (0, aiModelConfig_1.getProviderApiKey)('claude');
    if (!apiKey) {
        throw new Error('Claude API key is not set');
    }
    const response = await fetch('https://api.anthropic.com/v1/messages/batches', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ requests }),
    });
    if (!response.ok) {
        throw new Error(`Anthropic batch create failed (${response.status}): ${await response.text()}`);
    }
    return response.json();
}
async function retrieveAnthropicMessageBatch(batchId) {
    const apiKey = await (0, aiModelConfig_1.getProviderApiKey)('claude');
    if (!apiKey) {
        throw new Error('Claude API key is not set');
    }
    const response = await fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, {
        method: 'GET',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
    });
    if (!response.ok) {
        throw new Error(`Anthropic batch retrieve failed (${response.status}): ${await response.text()}`);
    }
    return response.json();
}
async function waitForAnthropicMessageBatch(batchId, pollIntervalMs = 5000, maxWaitMs = 20 * 60 * 1000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < maxWaitMs) {
        const batch = await retrieveAnthropicMessageBatch(batchId);
        if (batch.processing_status === 'ended') {
            return batch;
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(`Anthropic batch ${batchId} did not finish within ${Math.round(maxWaitMs / 60000)} minutes`);
}
async function readAnthropicMessageBatchResults(resultsUrl) {
    const apiKey = await (0, aiModelConfig_1.getProviderApiKey)('claude');
    if (!apiKey) {
        throw new Error('Claude API key is not set');
    }
    const response = await fetch(resultsUrl, {
        method: 'GET',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
    });
    if (!response.ok) {
        throw new Error(`Anthropic batch results download failed (${response.status}): ${await response.text()}`);
    }
    const jsonl = await response.text();
    return jsonl
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}
async function createTextCompletion(prompt, provider = DEFAULT_PROVIDER, maxTokens = 4000, temperature = 0, responseFormat = 'json', modelName) {
    const settings = await (0, aiModelConfig_1.getAIModelSettings)();
    if (!(0, aiModelConfig_1.isProviderEnabled)(provider, settings)) {
        throw new Error(`Selected AI model provider '${provider}' is disabled by admin.`);
    }
    if (provider === 'openai') {
        const messages = [];
        if (responseFormat === 'json') {
            messages.push({
                role: 'system',
                content: JSON_ONLY_SYSTEM_PROMPT,
            });
        }
        messages.push({
            role: 'user',
            content: prompt,
        });
        return createOpenAIChatCompletion({
            model: modelName || aiModelCatalog_1.DEFAULT_OPENAI_MODEL,
            maxTokens,
            temperature,
            responseFormat,
            messages,
        });
    }
    if (provider === 'openrouter') {
        const messages = [];
        if (responseFormat === 'json') {
            messages.push({
                role: 'system',
                content: JSON_ONLY_SYSTEM_PROMPT,
            });
        }
        messages.push({
            role: 'user',
            content: prompt,
        });
        return createOpenRouterCompletion({
            model: modelName || aiModelCatalog_1.DEFAULT_OPENROUTER_MODEL,
            maxTokens,
            temperature,
            responseFormat,
            messages,
        });
    }
    return createAnthropicMessage(prompt, maxTokens, temperature, modelName || aiModelCatalog_1.DEFAULT_CLAUDE_MODEL);
}
async function resolvePromptExecutionConfig(promptId, fallbackProvider) {
    const prompt = await (0, promptService_1.getPromptById)(promptId);
    if (!prompt?.modelProvider || !prompt.modelName) {
        return { provider: fallbackProvider };
    }
    return {
        provider: prompt.modelProvider,
        modelName: prompt.modelName,
    };
}
function isAnthropicOptimizedModel(modelName) {
    return typeof modelName === 'string' && modelName.trim() === aiModelCatalog_1.DEFAULT_CLAUDE_MODEL;
}
async function shouldUseAnthropicOptimizationsForPrompt(promptId, requestedProvider) {
    if (requestedProvider !== 'claude') {
        return false;
    }
    const executionConfig = await resolvePromptExecutionConfig(promptId, requestedProvider);
    if (executionConfig.provider !== 'claude') {
        return false;
    }
    const settings = await (0, aiModelConfig_1.getAIModelSettings)();
    if (!(0, aiModelConfig_1.isProviderEnabled)('claude', settings)) {
        return false;
    }
    return isAnthropicOptimizedModel(executionConfig.modelName || aiModelCatalog_1.DEFAULT_CLAUDE_MODEL);
}
async function createPromptCompletion(input) {
    const executionConfig = await resolvePromptExecutionConfig(input.promptId, input.fallbackProvider || DEFAULT_PROVIDER);
    const settings = await (0, aiModelConfig_1.getAIModelSettings)();
    if (!(0, aiModelConfig_1.isProviderEnabled)(executionConfig.provider, settings)) {
        throw new Error(`Selected AI model provider '${executionConfig.provider}' is disabled by admin.`);
    }
    if (input.promptId === TAILOR_RESUME_PROMPT_ID && input.promptValues) {
        if (executionConfig.provider === 'claude') {
            return createAnthropicPromptCompletion({
                promptId: input.promptId,
                values: input.promptValues,
                maxTokens: input.maxTokens,
                temperature: input.temperature,
                responseFormat: input.responseFormat,
                modelName: executionConfig.modelName,
                cacheTtl: input.anthropicCacheTtl,
            });
        }
        const messages = await buildTailorResumeChatMessages(input.promptValues, input.responseFormat ?? 'json');
        if (executionConfig.provider === 'openai') {
            return createOpenAIChatCompletion({
                model: executionConfig.modelName || aiModelCatalog_1.DEFAULT_OPENAI_MODEL,
                maxTokens: input.maxTokens ?? 4000,
                temperature: input.temperature ?? 0,
                responseFormat: input.responseFormat ?? 'json',
                messages,
            });
        }
        if (executionConfig.provider === 'openrouter') {
            return createOpenRouterCompletion({
                model: executionConfig.modelName || aiModelCatalog_1.DEFAULT_OPENROUTER_MODEL,
                maxTokens: input.maxTokens ?? 4000,
                temperature: input.temperature ?? 0,
                responseFormat: input.responseFormat ?? 'json',
                messages,
            });
        }
    }
    if (executionConfig.provider === 'claude' && input.promptValues) {
        return createAnthropicPromptCompletion({
            promptId: input.promptId,
            values: input.promptValues,
            maxTokens: input.maxTokens,
            temperature: input.temperature,
            responseFormat: input.responseFormat,
            modelName: executionConfig.modelName,
            cacheTtl: input.anthropicCacheTtl,
        });
    }
    return createTextCompletion(input.prompt, executionConfig.provider, input.maxTokens, input.temperature, input.responseFormat, executionConfig.modelName);
}
async function canUseAnthropicBatchForPrompt(promptId, fallbackProvider) {
    return shouldUseAnthropicOptimizationsForPrompt(promptId, fallbackProvider);
}
async function batchCreatePromptCompletions(input) {
    const executionConfig = await resolvePromptExecutionConfig(input.promptId, input.fallbackProvider || DEFAULT_PROVIDER);
    const settings = await (0, aiModelConfig_1.getAIModelSettings)();
    if (!(0, aiModelConfig_1.isProviderEnabled)(executionConfig.provider, settings)) {
        throw new Error(`Selected AI model provider '${executionConfig.provider}' is disabled by admin.`);
    }
    if (executionConfig.provider !== 'claude') {
        throw new Error(`Prompt "${input.promptId}" is not configured to run on Anthropic.`);
    }
    const requests = await Promise.all(input.items.map(async (item) => ({
        custom_id: item.customId,
        params: await buildAnthropicPromptRequest({
            promptId: input.promptId,
            values: item.values,
            maxTokens: input.maxTokens ?? 4000,
            temperature: input.temperature ?? 0,
            responseFormat: input.responseFormat ?? 'json',
            modelName: executionConfig.modelName || aiModelCatalog_1.DEFAULT_CLAUDE_MODEL,
            cacheTtl: input.anthropicCacheTtl,
        }),
    })));
    const createdBatch = await createAnthropicMessageBatch(requests);
    const finishedBatch = createdBatch.processing_status === 'ended'
        ? createdBatch
        : await waitForAnthropicMessageBatch(createdBatch.id);
    if (!finishedBatch.results_url) {
        throw new Error(`Anthropic batch ${finishedBatch.id} completed without a results URL.`);
    }
    const results = await readAnthropicMessageBatchResults(finishedBatch.results_url);
    const resultMap = new Map();
    for (const item of results) {
        if (item.result.type !== 'succeeded') {
            const failureReason = item.result.error?.message || `Anthropic batch request ${item.result.type}`;
            resultMap.set(item.custom_id, { error: failureReason });
            continue;
        }
        const textBlock = item.result.message?.content?.find((block) => block.type === 'text' && typeof block.text === 'string');
        if (!textBlock?.text) {
            resultMap.set(item.custom_id, { error: 'Anthropic batch request returned no text content.' });
            continue;
        }
        resultMap.set(item.custom_id, { content: textBlock.text });
    }
    if (input.anthropicCacheTtl && !anthropicCacheUsageWarningShown) {
        anthropicCacheUsageWarningShown = true;
        console.info(`Anthropic prompt caching enabled for batch prompt "${input.promptId}" with TTL ${input.anthropicCacheTtl}. Inspect Anthropic usage metrics to confirm cache hit rates in your workspace.`);
    }
    return resultMap;
}
function normalizeSkillsList(skills) {
    if (!Array.isArray(skills))
        return [];
    const seen = new Set();
    const normalized = [];
    for (const raw of skills) {
        if (typeof raw !== 'string')
            continue;
        const skill = raw.trim();
        if (!skill)
            continue;
        const key = skill.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        normalized.push(skill);
    }
    return normalized;
}
function asString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function toStringList(value) {
    if (Array.isArray(value)) {
        return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }
    return [];
}
function normalizeJobAnalysisResponse(parsed, jobDescription) {
    // const inferredSoft = inferAtsSoftSkillsFromText(jobDescription);
    // const inferredHard = inferHardSkillsFromText(jobDescription);
    const required = normalizeSkillsList([
        ...toStringList(parsed.skills?.required),
        // ...inferredHard,
    ]);
    const preferred = normalizeSkillsList([
        ...toStringList(parsed.skills?.preferred),
    ]);
    const tools = normalizeSkillsList(toStringList(parsed.skills?.tools));
    const technologies = normalizeSkillsList(toStringList(parsed.skills?.technologies));
    const responsibilities = normalizeSkillsList([
        ...toStringList(parsed.responsibilities),
    ]);
    const domainKnowledge = normalizeSkillsList([
        ...toStringList(parsed.domainKnowledge),
    ]);
    const softSkills = prioritizeSoftSkills(normalizeSkillsList([
        ...toStringList(parsed.softSkills),
    ]));
    const keywordGroups = parsed.keywords && typeof parsed.keywords === 'object' && !Array.isArray(parsed.keywords)
        ? parsed.keywords
        : {};
    return {
        jobMeta: {
            title: asString(parsed.jobMeta?.title) || asString(parsed.jobMeta?.title),
            seniority: asString(parsed.jobMeta?.seniority),
            industry: asString(parsed.jobMeta?.industry),
            department: asString(parsed.jobMeta?.department),
        },
        skills: {
            required,
            preferred,
            tools,
            technologies,
        },
        responsibilities,
        domainKnowledge,
        softSkills,
        keywords: {
            actionVerbs: normalizeSkillsList(toStringList(keywordGroups.actionVerbs)),
            buzzwords: normalizeSkillsList(toStringList(keywordGroups.buzzwords)),
            mustInclude: normalizeSkillsList([
                ...toStringList(keywordGroups.mustInclude),
            ]),
        },
        sourceJobDescription: jobDescription.trim(),
    };
}
function getJobAnalysisTitle(jobAnalysis) {
    return jobAnalysis?.jobMeta?.title?.trim() ?? '';
}
function getRequiredSkills(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.skills?.required);
}
function getPreferredSkills(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.skills?.preferred);
}
function getSkillTools(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.skills?.tools);
}
function getSkillTechnologies(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.skills?.technologies);
}
function getResponsibilities(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.responsibilities);
}
function getDomainKnowledge(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.domainKnowledge);
}
function getSoftSkills(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.softSkills);
}
function getIndustryTerms(jobAnalysis) {
    return normalizeSkillsList([
        jobAnalysis?.jobMeta?.industry ?? '',
        jobAnalysis?.jobMeta?.department ?? '',
        ...getDomainKnowledge(jobAnalysis),
    ]);
}
function getKeywordChecklist(jobAnalysis) {
    return normalizeSkillsList([
        ...(jobAnalysis?.keywords?.actionVerbs ?? []),
        ...(jobAnalysis?.keywords?.buzzwords ?? []),
        ...(jobAnalysis?.keywords?.mustInclude ?? []),
        ...getSkillTools(jobAnalysis),
        ...getSkillTechnologies(jobAnalysis),
        ...getDomainKnowledge(jobAnalysis),
    ]);
}
function getHardSkillChecklist(jobAnalysis) {
    return normalizeSkillsList([
        ...getRequiredSkills(jobAnalysis),
        ...getPreferredSkills(jobAnalysis),
        ...getSkillTools(jobAnalysis),
        ...getSkillTechnologies(jobAnalysis),
        ...getKeywordChecklist(jobAnalysis),
        ...getIndustryTerms(jobAnalysis),
    ]);
}
function normalizeHardSkillAlias(skill) {
    return skill.trim().toLowerCase().replace(/\s+/g, ' ');
}
/** Job titles to exclude from hard skills - these are roles, not technical skills */
const JOB_TITLE_EXCLUSIONS = new Set([
    'full stack developer', 'fullstack developer', 'full-stack developer',
    'frontend developer', 'front-end developer', 'frotnend developer',
    'backend developer', 'back-end developer',
    'full stack engineer', 'frontend engineer', 'backend engineer',
    'software developer', 'software engineer',
]);
function capitalizeHardSkill(s) {
    if (!s || s.length === 0)
        return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function inferHardSkillCategory(skillAlias) {
    const rules = [
        {
            category: 'backend',
            patterns: [
                'python', 'fastapi', 'django', 'flask', 'pydantic', 'node', 'express', 'nestjs', 'fastify', 'koa',
                'rails', 'gin', 'echo', 'spring', 'laravel', 'symfony', 'grpc', 'websocket', 'server-sent',
                'microservice', 'event-driven', 'domain-driven', 'ddd', 'celery', 'rabbitmq', 'kafka', 'rest api',
                'restful api', 'graphql', 'async', 'background job', 'message queue', 'serverless', 'api gateway',
            ],
        },
        {
            category: 'frontend',
            patterns: [
                'react', 'angular', 'vue', 'next', 'nuxt', 'typescript', 'javascript', 'redux', 'zustand', 'mobx',
                'rxjs', 'html', 'css', 'scss', 'sass', 'tailwind', 'bootstrap', 'mui', 'material ui', 'ant design',
                'chakra', 'styled component', 'emotion', 'chart.js', 'd3', 'three.js', 'responsive design',
                'mobile-first', 'pwa', 'webpack', 'vite', 'rollup', 'babel', 'eslint', 'prettier',
            ],
        },
        {
            category: 'databases',
            patterns: [
                'postgres', 'mysql', 'sql server', 'oracle', 'mongodb', 'dynamodb', 'cassandra', 'couchdb', 'redis',
                'memcached', 'firestore', 'elasticsearch', 'solr', 'influxdb', 'timescaledb', 'neo4j', 'etl',
                'warehouse', 'data lake', 'sqlalchemy', 'prisma', 'typeorm', 'sequelize', 'mongoose', 'activerecord',
                'query optimization', 'indexing', 'sharding', 'replication', 'data model', 'database migration', 'acid',
            ],
        },
        {
            category: 'cloud-devops',
            patterns: [
                'aws', 'lambda', 'eks', 'ecs', 'fargate', 'ec2', 's3', 'cloudfront', 'rds', 'cloudwatch', 'sagemaker',
                'step function', 'sns', 'sqs', 'iam', 'vpc', 'route 53', 'gcp', 'google cloud', 'azure', 'docker',
                'kubernetes', 'helm', 'openshift', 'terraform', 'cloudformation', 'ansible', 'puppet', 'chef',
                'github actions', 'jenkins', 'gitlab ci', 'circleci', 'travis ci', 'argocd', 'flux', 'ci/cd',
                'infrastructure as code', 'iac', 'grafana', 'prometheus', 'datadog', 'new relic', 'elk', 'istio',
                'linkerd', 'load balancing', 'auto scaling',
            ],
        },
        {
            category: 'testing-automation',
            patterns: [
                'pytest', 'jest', 'junit', 'testng', 'mocha', 'chai', 'jasmine', 'cypress', 'playwright', 'selenium',
                'puppeteer', 'webdriverio', 'postman', 'insomnia', 'rest assured', 'locust', 'k6', 'jmeter',
                'artillery', 'unit testing', 'integration testing', 'end-to-end', 'e2e', 'api testing', 'tdd', 'bdd',
                'performance testing', 'security testing', 'penetration testing', 'code coverage', 'sonarqube', 'qa',
                'test automation',
            ],
        },
        {
            category: 'ai-ml',
            patterns: [
                'openai', 'chatgpt', 'claude api', 'langchain', 'llamaindex', 'transformers', 'tensorflow', 'pytorch',
                'keras', 'scikit-learn', 'xgboost', 'lightgbm', 'spacy', 'nltk', 'pandas', 'numpy', 'matplotlib',
                'seaborn', 'jupyter', 'prompt engineering', 'fine-tuning', 'rag', 'pinecone', 'chroma', 'weaviate',
                'mlops', 'computer vision', 'natural language processing', 'nlp', 'deep learning', 'machine learning',
            ],
        },
        {
            category: 'tools-methodologies',
            patterns: [
                'git', 'github', 'gitlab', 'bitbucket', 'jira', 'asana', 'trello', 'linear', 'monday', 'confluence',
                'notion', 'swagger', 'figma', 'sketch', 'adobe xd', 'vscode', 'pycharm', 'intellij', 'webstorm',
                'sublime', 'vim', 'agile', 'scrum', 'kanban', 'devops', 'clean architecture', 'solid', 'design pattern',
                'code review', 'pair programming', 'npm', 'yarn', 'pip', 'poetry', 'maven', 'gradle',
            ],
        },
    ];
    for (const rule of rules) {
        if (rule.patterns.some((pattern) => skillAlias.includes(pattern))) {
            return rule.category;
        }
    }
    return 'other';
}
function resolveHardSkill(skill) {
    const normalized = skill.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.length > 50 || /[.!?]/.test(normalized))
        return null;
    const lower = normalizeHardSkillAlias(normalized);
    // Exclude job titles (full stack developer, frontend developer, etc.)
    if (JOB_TITLE_EXCLUSIONS.has(lower))
        return null;
    // Exclude soft skills only (communication, collaboration, ownership, etc.)
    if (SOFT_SKILL_SIGNALS.some((signal) => lower.includes(signal)))
        return null;
    // If in alias map, return canonical form (already properly capitalized)
    const mapped = HARD_SKILL_ALIAS_MAP.get(lower);
    if (mapped)
        return mapped;
    // Pass through as hard skill: frameworks, tools, architectures, methodologies, tech names
    const techIndicators = [
        'api', 'rest', 'graphql', 'backend', 'frontend', 'fullstack', 'full-stack',
        'microservice', 'event-driven', 'distributed', 'database', 'sql', 'etl',
        'devops', 'ci/cd', 'docker', 'kubernetes', 'aws', 'cloud', 'architecture',
        'python', 'javascript', 'typescript', 'react', 'vue', 'angular', 'nuxt', 'svelte', 'ember', 'django', 'node', 'go', 'rust', 'rails', 'spring', 'laravel',
        'redis', 'postgres', 'mysql', 'kafka', 'airflow', 'dbt', 'snowflake',
        'terraform', 'testing', 'celery', 'flutter', 'lambda', 'cloudflare',
    ];
    if (techIndicators.some((term) => lower.includes(term))) {
        return {
            display: capitalizeHardSkill(normalized),
            category: inferHardSkillCategory(lower),
            priority: Number.MAX_SAFE_INTEGER,
        };
    }
    // Single-word tech (Airflow, dbt, Kafka) - allow if looks like a tool/framework name
    if (/^[a-z0-9][a-z0-9+\-./]*$/.test(lower) && lower.length >= 2) {
        return {
            display: capitalizeHardSkill(normalized),
            category: inferHardSkillCategory(lower),
            priority: Number.MAX_SAFE_INTEGER,
        };
    }
    return null;
}
function normalizeAllowedHardSkills(skills) {
    const seen = new Set();
    const result = [];
    for (const raw of skills) {
        const resolved = resolveHardSkill(raw);
        if (!resolved)
            continue;
        const display = resolved.display;
        const key = display.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(display);
    }
    return result;
}
function getHardSkillPriority(skill) {
    return hardSkillPriorityMap.get(skill.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
}
function getProfileHardSkillInventory(profile) {
    return new Set(normalizeAllowedHardSkills(profile?.skills ?? []).map((skill) => skill.toLowerCase()));
}
function restrictHardSkillsToProfileInventory(skills, profile) {
    const inventory = getProfileHardSkillInventory(profile);
    if (inventory.size === 0) {
        return skills;
    }
    return skills.filter((skill) => inventory.has(skill.toLowerCase()));
}
function isTechnicalSkill(skill) {
    return resolveHardSkill(skill) !== null;
}
const MAX_SOFT_SKILL_LENGTH = 30;
/** Map long soft skill phrases to short key points */
const SOFT_SKILL_CONDENSE = [
    { patterns: ['excellent communication', 'communication and collaboration', 'communication skills', 'communicate'], key: 'Communication' },
    { patterns: ['collaboration', 'collaborative', 'collaborate'], key: 'Collaboration' },
    { patterns: ['cross-functional', 'cross functional'], key: 'Cross-functional' },
    { patterns: ['problem-solving', 'problem solving'], key: 'Problem-solving' },
    { patterns: ['ownership', 'high ownership'], key: 'Ownership' },
    { patterns: ['autonomy', 'self-directed', 'independent'], key: 'Autonomy' },
    { patterns: ['transparency', 'transparent'], key: 'Transparency' },
    { patterns: ['reliability', 'reliable'], key: 'Reliability' },
    { patterns: ['supportive', 'support'], key: 'Supportive' },
    { patterns: ['passionate', 'passion'], key: 'Passion' },
    { patterns: ['mentorship', 'mentor', 'help fellow'], key: 'Mentorship' },
    { patterns: ['adaptability', 'adapt'], key: 'Adaptability' },
    { patterns: ['eager to learn', 'lifelong learning'], key: 'Eager to learn' },
    { patterns: ['accountability', 'accountable'], key: 'Accountability' },
    { patterns: ['attention to detail', 'detail-oriented'], key: 'Attention to detail' },
    { patterns: ['team player', 'we are one team'], key: 'Team player' },
    { patterns: ['diverse', 'diversity'], key: 'Diversity' },
    { patterns: ['innovative', 'innovation', 'great ideas'], key: 'Innovation' },
    { patterns: ['analytics', 'applied ai'], key: 'Analytics & AI' },
    { patterns: ['scalable', 'polished'], key: 'Quality focus' },
];
function condenseSoftSkill(s) {
    const trimmed = s.trim();
    if (trimmed.length <= MAX_SOFT_SKILL_LENGTH) {
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
    const lower = trimmed.toLowerCase();
    for (const { patterns, key } of SOFT_SKILL_CONDENSE) {
        const matches = Array.isArray(patterns)
            ? patterns.some((p) => lower.includes(p.toLowerCase()))
            : patterns.test(lower);
        if (matches)
            return key;
    }
    const firstWord = trimmed.split(/\s+/)[0];
    return firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1) : trimmed;
}
function prioritizeSoftSkills(skills) {
    return [...skills].sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        const aScore = SOFT_SKILL_SIGNALS.reduce((count, signal) => count + (aLower.includes(signal) ? 1 : 0), 0);
        const bScore = SOFT_SKILL_SIGNALS.reduce((count, signal) => count + (bLower.includes(signal) ? 1 : 0), 0);
        if (bScore !== aScore)
            return bScore - aScore;
        return a.length - b.length;
    });
}
function inferAtsSoftSkillsFromText(text) {
    const lower = text.toLowerCase();
    return ATS_SOFT_SKILL_RULES
        .filter((rule) => rule.patterns.some((pattern) => lower.includes(pattern)))
        .map((rule) => rule.canonical);
}
function inferAtsSoftSkillsFromAnalysis(jobAnalysis) {
    if (!jobAnalysis)
        return [];
    const text = [
        ...getSoftSkills(jobAnalysis),
        ...getKeywordChecklist(jobAnalysis),
        ...getResponsibilities(jobAnalysis),
        ...getIndustryTerms(jobAnalysis),
    ].join(' | ');
    return inferAtsSoftSkillsFromText(text);
}
function inferHardSkillsFromText(text) {
    const lower = text.toLowerCase();
    return HARD_SKILL_RULES
        .filter((rule) => rule.patterns.some((pattern) => lower.includes(pattern)))
        .map((rule) => rule.canonical);
}
function buildJobDescriptionSkillPriority(jobAnalysis) {
    const normalized = normalizeAllowedHardSkills(getHardSkillChecklist(jobAnalysis));
    const priorityMap = new Map();
    normalized.forEach((skill, index) => {
        priorityMap.set(skill.toLowerCase(), index);
    });
    return priorityMap;
}
function prioritizeHardSkills(skills, jobAnalysis) {
    const normalized = normalizeAllowedHardSkills(skills);
    const originalOrder = new Map();
    const jdPriority = buildJobDescriptionSkillPriority(jobAnalysis);
    normalized.forEach((skill, index) => {
        originalOrder.set(skill.toLowerCase(), index);
    });
    return [...normalized].sort((a, b) => {
        const aResolved = resolveHardSkill(a);
        const bResolved = resolveHardSkill(b);
        const aCategory = aResolved?.category ?? 'other';
        const bCategory = bResolved?.category ?? 'other';
        const categoryDiff = HARD_SKILL_CATEGORY_WEIGHT[aCategory] - HARD_SKILL_CATEGORY_WEIGHT[bCategory];
        if (categoryDiff !== 0) {
            return categoryDiff;
        }
        const aJdOrder = jdPriority.get(a.toLowerCase());
        const bJdOrder = jdPriority.get(b.toLowerCase());
        const aInJd = typeof aJdOrder === 'number';
        const bInJd = typeof bJdOrder === 'number';
        if (aInJd !== bInJd) {
            return aInJd ? -1 : 1;
        }
        if (aInJd && bInJd && aJdOrder !== bJdOrder) {
            return (aJdOrder ?? 0) - (bJdOrder ?? 0);
        }
        const libraryPriorityDiff = getHardSkillPriority(a) - getHardSkillPriority(b);
        if (libraryPriorityDiff !== 0) {
            return libraryPriorityDiff;
        }
        const templatePriorityDiff = (aResolved?.priority ?? Number.MAX_SAFE_INTEGER)
            - (bResolved?.priority ?? Number.MAX_SAFE_INTEGER);
        if (templatePriorityDiff !== 0) {
            return templatePriorityDiff;
        }
        return (originalOrder.get(a.toLowerCase()) ?? 0) - (originalOrder.get(b.toLowerCase()) ?? 0);
    });
}
function finalizeHardSkills(skills, jobAnalysis) {
    const prioritized = prioritizeHardSkills(skills, jobAnalysis);
    const categoryCounts = new Map();
    const limited = [];
    for (const skill of prioritized) {
        const category = resolveHardSkill(skill)?.category ?? 'other';
        const currentCount = categoryCounts.get(category) ?? 0;
        if (currentCount >= MAX_HARD_SKILLS_PER_CATEGORY) {
            continue;
        }
        limited.push(skill);
        categoryCounts.set(category, currentCount + 1);
        if (limited.length >= MAX_HARD_SKILLS) {
            break;
        }
    }
    return limited;
}
function sortHardSkillsByLibraryPriority(skills) {
    return [...skills].sort((a, b) => {
        const priorityDiff = getHardSkillPriority(a) - getHardSkillPriority(b);
        if (priorityDiff !== 0) {
            return priorityDiff;
        }
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
}
function finalizeSoftSkills(skills) {
    const condensed = prioritizeSoftSkills(normalizeSkillsList(skills)).map(condenseSoftSkill);
    return (0, array_1.uniqueCaseInsensitive)(condensed).slice(0, MAX_SOFT_SKILLS);
}
function buildFallbackExperienceDescription(title, jobAnalysis) {
    const role = title.trim() || 'Engineer';
    const responsibility = getResponsibilities(jobAnalysis).find((item) => item.trim()) ||
        'delivering reliable solutions aligned with business goals';
    const keywords = getKeywordChecklist(jobAnalysis).slice(0, 2).join(', ');
    const suffix = keywords ? ` with focus on ${keywords}` : '';
    const text = `${role} focused on ${responsibility}${suffix}.`;
    return text.slice(0, MAX_ROLE_BRIEF_LENGTH).trim();
}
function buildFallbackAchievements(jobAnalysis) {
    const base = getResponsibilities(jobAnalysis)
        .filter((item) => item.trim())
        .slice(0, 3);
    if (base.length > 0) {
        return base.map((item) => item.replace(/\.$/, '').trim());
    }
    return [
        'Improved delivery consistency across critical projects.',
        'Enhanced service reliability and operational efficiency.',
    ];
}
function ensureMinLength(text, minLength, fillerParts) {
    let result = text.trim();
    for (const part of fillerParts) {
        if (result.length >= minLength)
            break;
        const clean = part.trim().replace(/\s+/g, ' ');
        if (!clean)
            continue;
        result = result ? `${result} ${clean}` : clean;
    }
    return result;
}
function ensureSummaryUsesExperienceYears(summary, profile) {
    const years = profile.totalYearsExperience;
    if (typeof years !== 'number' || !Number.isFinite(years) || years < 0) {
        return summary.trim();
    }
    const normalizedSummary = summary.trim().replace(/\s+/g, ' ');
    const yearsText = Number.isInteger(years) ? String(years) : years.toFixed(1);
    const prefixRole = profile.title?.trim() || 'Professional';
    const topSkills = (profile.skills ?? []).slice(0, 3);
    const skillsText = topSkills.length > 0 ? ` in ${topSkills.join(', ')}` : '';
    const leadSentence = `${prefixRole} with about ${yearsText} years of experience${skillsText}.`;
    // Keep the remaining summary content, but avoid duplicate years-style lead sentences.
    const remainder = normalizedSummary
        .replace(/^[^.]*\b\d+(?:\.\d+)?\s*\+?\s*years?\b[^.]*\.?\s*/i, '')
        .trim();
    return remainder ? `${leadSentence} ${remainder}` : leadSentence;
}
function limitSummaryNumericMentions(summary, maxMentions = 1) {
    const text = summary.trim().replace(/\s+/g, ' ');
    if (!text)
        return text;
    const numberPattern = /\b\d+(?:\.\d+)?\+?\b/g;
    let seen = 0;
    return text.replace(numberPattern, (match) => {
        seen += 1;
        return seen <= maxMentions ? match : '';
    }).replace(/\s+/g, ' ').replace(/\s([.,;:!?])/g, '$1').trim();
}
function toTitleCase(text) {
    return text
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}
function buildSimpleSeniorEngineerTitle(contentTitle, jobAnalysis, profile) {
    const source = (getJobAnalysisTitle(jobAnalysis) || contentTitle || profile?.title || '').trim();
    const cleaned = source
        .replace(/[^a-zA-Z0-9\s/+.-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const stopWords = new Set([
        'a',
        'an',
        'and',
        'for',
        'of',
        'the',
        'to',
        'with',
        'at',
        'in',
        'on',
    ]);
    const roleWords = new Set([
        'engineer',
        'engineering',
        'developer',
        'development',
        'architect',
        'specialist',
        'manager',
        'lead',
        'principal',
        'staff',
        'sr',
        'senior',
        'mid',
        'junior',
        'ii',
        'iii',
        'iv',
    ]);
    const domainTokens = cleaned
        .split(/\s+/)
        .map((token) => token.toLowerCase())
        .filter((token) => token && !stopWords.has(token) && !roleWords.has(token))
        .slice(0, 2);
    const domain = domainTokens.length > 0 ? toTitleCase(domainTokens.join(' ')) : 'Software';
    return `Senior ${domain} Engineer`;
}
function normalizeTailoredContent(content, jobAnalysis, profile) {
    // Job analysis skills FIRST (required, preferred, keywords) - must appear in hard skills
    const jobHardRaw = getHardSkillChecklist(jobAnalysis);
    const combinedHardRaw = [
        ...jobHardRaw,
        ...(content.requiredSkills ?? []),
        ...(content.preferredSkills ?? []),
        ...(content.hardSkills ?? content.skills ?? []),
        ...(profile?.skills ?? []),
    ];
    const atsSoftPriority = inferAtsSoftSkillsFromAnalysis(jobAnalysis);
    const hardSkills = sortHardSkillsByLibraryPriority(finalizeHardSkills(restrictHardSkillsToProfileInventory(normalizeAllowedHardSkills(combinedHardRaw), profile), jobAnalysis));
    const softFromModel = normalizeSkillsList(content.softSkills);
    const softFromAnalysis = getSoftSkills(jobAnalysis);
    const softMerged = normalizeSkillsList([...atsSoftPriority, ...softFromModel, ...softFromAnalysis]);
    const softLimited = finalizeSoftSkills(softMerged);
    const trimIncompleteEnd = (s) => s.trim().replace(/,+\s*$/, '').replace(/\s+(and|or)\s*$/i, '').trim();
    const stripBoldTags = (s) => s.replace(/<\/?strong>/gi, '').replace(/<\/?b>/gi, '');
    const clampRoleBrief = (description) => {
        const cleanBase = stripBoldTags(description).trim().replace(/\s+/g, ' ');
        const clean = ensureMinLength(cleanBase, MIN_ROLE_BRIEF_LENGTH, [
            ...getResponsibilities(jobAnalysis).slice(0, 3),
            ...getKeywordChecklist(jobAnalysis).slice(0, 2).map((k) => `Focus on ${k}.`),
        ]);
        if (clean.length <= MAX_ROLE_BRIEF_LENGTH)
            return trimIncompleteEnd(clean);
        const truncated = clean.slice(0, MAX_ROLE_BRIEF_LENGTH);
        let result;
        const lastSentenceEnd = Math.max(truncated.lastIndexOf('. '), truncated.lastIndexOf('! '), truncated.lastIndexOf('? '));
        if (lastSentenceEnd >= MAX_ROLE_BRIEF_LENGTH - 80) {
            result = truncated.slice(0, lastSentenceEnd + 1).trim();
        }
        else {
            const lastComma = truncated.lastIndexOf(', ');
            if (lastComma >= MAX_ROLE_BRIEF_LENGTH - 50) {
                result = truncated.slice(0, lastComma).trim();
            }
            else {
                const lastSpace = truncated.trimEnd().lastIndexOf(' ');
                result = lastSpace > 0 && lastSpace >= MAX_ROLE_BRIEF_LENGTH - 40
                    ? truncated.slice(0, lastSpace).trim()
                    : truncated.trimEnd();
            }
        }
        return trimIncompleteEnd(result);
    };
    const normalizeSummary = (summary) => stripBoldTags(summary).trim().replace(/\s+/g, ' ');
    const normalizedExperience = (content.experience ?? []).map((item) => ({
        ...item,
        description: clampRoleBrief(item.description ?? buildFallbackExperienceDescription(item.title ?? '', jobAnalysis)),
        achievements: normalizeSkillsList(item.achievements).length > 0
            ? normalizeSkillsList(item.achievements).map(stripBoldTags)
            : buildFallbackAchievements(jobAnalysis),
    }));
    const extractedJobTitle = getJobAnalysisTitle(jobAnalysis);
    if (normalizedExperience.length > 0 && extractedJobTitle) {
        const latestExperience = normalizedExperience[0];
        const baseDescription = (latestExperience.description ?? '').trim();
        const sentences = baseDescription
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const jobTitleSentence = `Aligned recent delivery with ${extractedJobTitle} role requirements and expected outcomes.`;
        const alreadyHasTitle = sentences.some((sentence) => sentence.toLowerCase().includes(extractedJobTitle.toLowerCase()));
        if (!alreadyHasTitle) {
            const rewritten = sentences.length > 0
                ? [sentences[0], jobTitleSentence, ...sentences.slice(1)]
                : [jobTitleSentence];
            latestExperience.description = clampRoleBrief(rewritten.join(' '));
            normalizedExperience[0] = latestExperience;
        }
    }
    const strengthKeywordPool = normalizeSkillsList([
        ...getRequiredSkills(jobAnalysis),
        ...getPreferredSkills(jobAnalysis),
        ...getKeywordChecklist(jobAnalysis),
        ...getIndustryTerms(jobAnalysis),
    ]).filter((keyword) => keyword.length >= 3);
    const fallbackStrengths = getResponsibilities(jobAnalysis)
        .filter((item) => item.trim())
        .slice(0, 4)
        .map((item, index) => ({
        title: `Core Strength ${index + 1}`,
        description: item.trim().replace(/\.$/, '') + '.',
    }));
    const baseStrengths = (content.strengths ?? []).length > 0 ? (content.strengths ?? []) : fallbackStrengths;
    const normalizedStrengths = baseStrengths.map((strength, index) => {
        const title = capitalizeFirstCharacter((strength?.title ?? `Core Strength ${index + 1}`).trim() || `Core Strength ${index + 1}`);
        const rawDescription = (strength?.description ?? '').trim();
        const keywordA = strengthKeywordPool[index % Math.max(strengthKeywordPool.length, 1)] ?? '';
        const keywordB = strengthKeywordPool[(index + 7) % Math.max(strengthKeywordPool.length, 1)] ?? '';
        const keywordSnippet = [keywordA, keywordB]
            .filter(Boolean)
            .join(' and ');
        const normalizedDescription = rawDescription
            ? stripBoldTags(rawDescription).replace(/\s+/g, ' ').replace(/\.$/, '')
            : 'Demonstrated impact in complex engineering environments';
        const hasKeyword = strengthKeywordPool.some((kw) => normalizedDescription.toLowerCase().includes(kw.toLowerCase()));
        const suffix = hasKeyword || !keywordSnippet
            ? '.'
            : `. Focused on ${keywordSnippet}.`;
        return {
            title,
            description: `${normalizedDescription}${suffix}`,
        };
    });
    return {
        ...content,
        title: buildSimpleSeniorEngineerTitle(content.title, jobAnalysis, profile),
        summary: limitSummaryNumericMentions(normalizeSummary(profile ? ensureSummaryUsesExperienceYears(content.summary ?? '', profile) : (content.summary ?? '').trim()), 1),
        experience: normalizedExperience,
        hardSkills,
        softSkills: softLimited,
        strengths: normalizedStrengths,
        // Keep legacy field aligned with hard skills for older templates/components.
        skills: hardSkills,
    };
}
async function analyzeJobDescription(jobDescription, provider = DEFAULT_PROVIDER) {
    const promptValues = buildAnalyzeJobDescriptionPromptValues(jobDescription);
    const prompt = await (0, promptService_1.renderPrompt)('analyze-job-description', {
        jobDescription,
    });
    const content = await createPromptCompletion({
        promptId: 'analyze-job-description',
        prompt,
        promptValues,
        fallbackProvider: provider,
        maxTokens: 7000,
        temperature: 0,
        responseFormat: 'json',
        anthropicCacheTtl: '5m',
    });
    return parseJobAnalysisContent(content, jobDescription);
}
function buildAnalyzeJobDescriptionPromptValues(jobDescription) {
    return {
        jobDescription,
    };
}
function parseJobAnalysisContent(content, jobDescription) {
    try {
        const jsonText = (0, json_1.extractJSON)(content);
        const parsed = JSON.parse(jsonText);
        return normalizeJobAnalysisResponse(parsed, jobDescription);
    }
    catch (error) {
        console.error('Failed to parse model response:', error, content);
        throw new Error('Failed to parse job analysis response');
    }
}
async function batchAnalyzeJobDescriptions(input) {
    const provider = input.provider || DEFAULT_PROVIDER;
    const canUseAnthropicBatch = input.items.length > 1
        && await canUseAnthropicBatchForPrompt('analyze-job-description', provider);
    if (!canUseAnthropicBatch) {
        const resultMap = new Map();
        for (const item of input.items) {
            try {
                const analysis = await analyzeJobDescription(item.jobDescription, provider);
                resultMap.set(item.customId, { analysis });
            }
            catch (error) {
                resultMap.set(item.customId, {
                    error: error instanceof Error ? error.message : 'Failed to analyze job description',
                });
            }
        }
        return resultMap;
    }
    const batchResults = await batchCreatePromptCompletions({
        promptId: 'analyze-job-description',
        items: input.items.map((item) => ({
            customId: item.customId,
            values: buildAnalyzeJobDescriptionPromptValues(item.jobDescription),
        })),
        fallbackProvider: provider,
        maxTokens: 7000,
        temperature: 0,
        responseFormat: 'json',
        anthropicCacheTtl: input.anthropicCacheTtl ?? '1h',
    });
    const resultMap = new Map();
    for (const item of input.items) {
        const result = batchResults.get(item.customId);
        if (!result?.content) {
            resultMap.set(item.customId, {
                error: result?.error || 'Analysis request failed',
            });
            continue;
        }
        try {
            const analysis = parseJobAnalysisContent(result.content, item.jobDescription);
            resultMap.set(item.customId, { analysis });
        }
        catch (error) {
            resultMap.set(item.customId, {
                error: error instanceof Error ? error.message : 'Failed to parse job analysis response',
            });
        }
    }
    return resultMap;
}
function buildTailorResumePromptValues(profile, jobAnalysis) {
    const { sourceJobDescription: _sourceJobDescription, ...jobAnalysisForPrompt } = jobAnalysis;
    return {
        profileJson: JSON.stringify(profile, null, 2),
        jobAnalysisJson: JSON.stringify(jobAnalysisForPrompt, null, 2),
        jobTitle: getJobAnalysisTitle(jobAnalysis),
        hardSkillsJSON: JSON.stringify([
            ...jobAnalysis.skills.preferred,
            ...jobAnalysis.skills.required,
            ...jobAnalysis.skills.technologies,
            ...jobAnalysis.skills.tools,
        ]),
        softSkillsJSON: JSON.stringify([...jobAnalysis.softSkills]),
        keywordsJson: JSON.stringify([
            ...jobAnalysis.keywords.actionVerbs,
            ...jobAnalysis.keywords.buzzwords,
            ...jobAnalysis.keywords.mustInclude,
        ]),
        keyResponsibilitiesJson: JSON.stringify([...jobAnalysis.responsibilities]),
        domainKnowledge: JSON.stringify([...jobAnalysis.domainKnowledge, jobAnalysis.jobMeta.industry]),
    };
}
function parseTailoredResumeContent(content, profile, jobAnalysis) {
    const jsonText = (0, json_1.extractJSON)(content);
    const parsed = JSON.parse(jsonText);
    const finalResult = normalizeTailoredContent(parsed, jobAnalysis, profile);
    const tailoringSourceText = getTailoringSourceText(jobAnalysis);
    const { confirmedSkills: confirmedHardSkills, unconfirmedSkills: unconfirmedHardSkills, } = reconcileSkillBuckets({
        extractedSkills: extractTechSkills(tailoringSourceText),
        modelSkills: finalResult.hardSkills,
        referenceSkills: technicalSkills,
        supplementSkills: config_1.supplimentTechSkills,
        minimumCount: 20,
        finalizeSkills: (skills) => finalizeHardSkills(restrictHardSkillsToProfileInventory(skills, profile), jobAnalysis),
    });
    const { confirmedSkills: confirmedSoftSkills, unconfirmedSkills: unconfirmedSoftSkills, } = reconcileSkillBuckets({
        extractedSkills: extractSoftSkills(tailoringSourceText),
        modelSkills: finalResult.softSkills,
        referenceSkills: softSkills,
        supplementSkills: config_1.supplimentSoftSkills,
        minimumCount: 5,
        finalizeSkills: finalizeSoftSkills,
    });
    return {
        ...finalResult,
        hardSkills: sortHardSkillsByLibraryPriority(confirmedHardSkills),
        softSkills: confirmedSoftSkills,
        unconfirmedHardSkills,
        unconfirmedSoftSkills,
        skills: sortHardSkillsByLibraryPriority(confirmedHardSkills),
    };
}
async function tailorResume(profile, jobAnalysis, provider = DEFAULT_PROVIDER) {
    const promptValues = buildTailorResumePromptValues(profile, jobAnalysis);
    const prompt = await (0, promptService_1.renderPrompt)('tailor-resume', promptValues);
    const shouldUseAnthropicOptimizations = await shouldUseAnthropicOptimizationsForPrompt('tailor-resume', provider);
    const content = await createPromptCompletion({
        promptId: 'tailor-resume',
        prompt,
        promptValues,
        fallbackProvider: provider,
        maxTokens: 11000,
        temperature: 0.2,
        responseFormat: 'json',
        anthropicCacheTtl: shouldUseAnthropicOptimizations ? '5m' : undefined,
    });
    try {
        return parseTailoredResumeContent(content, profile, jobAnalysis);
    }
    catch {
        console.error('Failed to parse model response:', content);
        throw new Error('Failed to parse tailored resume response');
    }
}
/**
 * Generate a cover letter body when no job description is provided.
 * Returns only the body text (no salutation or sign-off).
 */
async function generateCoverLetter(profile, companyName, role, provider = DEFAULT_PROVIDER) {
    const promptValues = {
        profileJson: JSON.stringify(profile, null, 2),
        companyName,
        role,
    };
    const prompt = await (0, promptService_1.renderPrompt)('generate-cover-letter', {
        profileJson: promptValues.profileJson,
        companyName,
        role,
    });
    const content = await createPromptCompletion({
        promptId: 'generate-cover-letter',
        prompt,
        promptValues,
        fallbackProvider: provider,
        maxTokens: 1500,
        temperature: 0.7,
        responseFormat: 'text',
        anthropicCacheTtl: '5m',
    });
    return content.trim();
}
async function extractTemplateFromPDF(pdfText, templateName, provider = DEFAULT_PROVIDER) {
    const promptValues = {
        pdfText,
        templateName,
    };
    const prompt = await (0, promptService_1.renderPrompt)('extract-template-from-pdf', {
        pdfText,
        templateName,
    });
    const content = await createPromptCompletion({
        promptId: 'extract-template-from-pdf',
        prompt,
        promptValues,
        fallbackProvider: provider,
        maxTokens: 8000,
        temperature: 0,
        responseFormat: 'json',
        anthropicCacheTtl: '5m',
    });
    try {
        const jsonText = (0, json_1.extractJSON)(content);
        return JSON.parse(jsonText);
    }
    catch {
        console.error('Failed to parse model response:', content);
        throw new Error('Failed to parse template extraction response');
    }
}
async function extractProfileFromResume(resumeText, provider = DEFAULT_PROVIDER) {
    const promptValues = {
        resumeText,
    };
    const prompt = await (0, promptService_1.renderPrompt)('extract-profile-from-resume', {
        resumeText,
    });
    const content = await createPromptCompletion({
        promptId: 'extract-profile-from-resume',
        prompt,
        promptValues,
        fallbackProvider: provider,
        maxTokens: 4000,
        temperature: 0,
        responseFormat: 'json',
        anthropicCacheTtl: '5m',
    });
    try {
        const jsonText = (0, json_1.extractJSON)(content);
        return JSON.parse(jsonText);
    }
    catch {
        console.error('Failed to parse model response:', content);
        throw new Error('Failed to parse profile extraction response');
    }
}
//# sourceMappingURL=claude.js.map
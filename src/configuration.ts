export default () => ({
  storage: {
    s3: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
      bucket: process.env.S3_BUCKET_NAME,
      expiresIn: process.env.EXPIRESIN || 157680000,
      containerPath: `${process.env.NODE_ENV}/commerce/logos`,
    },
  },
  database: {
    mongodb: {
      uri: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB_NAME,
    },
    dynamodb: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    },
  },
  observer: {
    endpoint: process.env.OBSERVER_ENDPOINT || '',
  },
});

ClassSync
=========

ClassSync is now ready to run as a small full-stack web app without Amazon Cognito.

Architecture:

- Frontend: `index.html`, `style.css`, `script.js`
- Backend: `server.js` using Node.js and Express
- Auth: email/password with `bcryptjs` password hashing
- Session: JWT stored in the browser
- Database: Amazon DynamoDB when `DYNAMODB_TABLE` is set
- File storage: Amazon S3 for uploaded submission proof images when `S3_BUCKET` is set
- Local fallback: `data/db.json` if DynamoDB is not configured

Local setup
-----------

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

AWS Learner Lab EC2 setup
-------------------------

1. Launch an EC2 instance, for example Amazon Linux or Ubuntu.
2. Install Node.js 18 or newer.
3. Upload or clone this project onto the instance.
4. Install dependencies:

```bash
npm install
```

5. Create a DynamoDB table:

```bash
aws dynamodb create-table \
  --table-name ClassSyncUsers \
  --attribute-definitions AttributeName=email,AttributeType=S \
  --key-schema AttributeName=email,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

6. Create an S3 bucket for proof images. Bucket names must be globally unique:

```bash
aws s3 mb s3://classsync-proof-images-your-name
```

For a short class demo, make uploaded proof image URLs readable:

```bash
aws s3api put-public-access-block \
  --bucket classsync-proof-images-your-name \
  --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
```

```bash
aws s3api put-bucket-policy \
  --bucket classsync-proof-images-your-name \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::classsync-proof-images-your-name/*"
      }
    ]
  }'
```

7. Set environment variables:

```bash
export JWT_SECRET="replace-this-with-a-long-random-secret"
export PORT=3000
export AWS_REGION="us-east-1"
export DYNAMODB_TABLE="ClassSyncUsers"
export S3_BUCKET="classsync-proof-images-your-name"
```

8. Start the app:

```bash
npm start
```

You should see:

```text
ClassSync running on http://0.0.0.0:3000
Using DynamoDB table: ClassSyncUsers
Using S3 bucket for proof images: classsync-proof-images-your-name
```

9. In the EC2 security group, allow inbound TCP port `3000` from your IP address.
10. Visit:

```text
http://YOUR_EC2_PUBLIC_IP:3000
```

Important notes
---------------

- Do not commit the `data/` folder. It is only for local fallback data.
- For the 3-service AWS architecture, use EC2 + DynamoDB + S3.
- For public production use, run behind HTTPS and set `JWT_SECRET` from environment variables.

ClassSync
=========

ClassSync is now ready to run as a small full-stack web app without Amazon Cognito.

Architecture:

- Frontend: `index.html`, `style.css`, `script.js`
- Backend: `server.js` using Node.js and Express
- Auth: email/password with `bcryptjs` password hashing
- Session: JWT stored in the browser
- Data: local JSON database at `data/db.json`

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

5. Set a strong JWT secret:

```bash
export JWT_SECRET="replace-this-with-a-long-random-secret"
export PORT=3000
```

6. Start the app:

```bash
npm start
```

7. In the EC2 security group, allow inbound TCP port `3000` from your IP address.
8. Visit:

```text
http://YOUR_EC2_PUBLIC_IP:3000
```

Important notes
---------------

- Do not commit the `data/` folder. It contains real user data.
- The current database is simple and good for a class project. For a stronger AWS version, replace `data/db.json` with DynamoDB or RDS.
- For public production use, run behind HTTPS and set `JWT_SECRET` from environment variables.

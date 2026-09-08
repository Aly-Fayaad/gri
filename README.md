# Agri API

A REST API for managing agricultural fields and generating satellite-based field insights.

## Features

- User signup, email confirmation, login, and JWT authentication
- Password reset by email
- Get the current user and list users
- Create, view, and delete agricultural fields
- Store field location and area information
- Fetch Sentinel-2 satellite data for a bounding box
- Generate water-status, crop-health, and salinity-risk insights
- Centralized error handling

## Tech Used

- Node.js
- Express 5
- MongoDB with Mongoose
- JSON Web Tokens (`jsonwebtoken`)
- `bcryptjs` for password and OTP hashing
- Nodemailer for email confirmation and password reset
- Axios and UTIF for Copernicus Sentinel-2 data
- dotenv for environment configuration

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `config.env` file in the project root. Add values for:

```env
NODE_ENV=development
PORT=3000
DATABASE=mongodb_connection_string
DATABASE_PASSWORD=your_database_password
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=90d
EMAIL_USER=your_email
EMAIL_PASSWORD=your_email_password
```

Do not commit real passwords, email credentials, or JWT secrets.

### 3. Start the server

```bash
npm start
```

The API runs at `http://localhost:3000` by default.

## Main Endpoints

### Authentication

- `POST /api/auth/signup`
- `POST /api/auth/confirm-email`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `PATCH /api/auth/reset-password/:token`

### Users

- `GET /api/users/me` - Get the authenticated user
- `GET /api/users` - List users

### Fields

- `POST /api/fields` - Create a field
- `GET /api/fields` - Get the authenticated user's fields
- `DELETE /api/fields/:id` - Delete a field
- `GET /api/fields/get-insights` - Get satellite-based field insights

Protected endpoints require a bearer token:

```text
Authorization: Bearer <jwt_token>
```

The insights endpoint accepts optional `bbox` and `startDate` query parameters. Example:

```text
GET /api/fields/get-insights?bbox=31.47,30.56,31.55,30.62&startDate=2026-06-01
```


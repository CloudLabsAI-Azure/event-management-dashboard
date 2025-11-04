/**
 * Azure B2C Token Validation Middleware for Node.js Backend
 * This is optional - only needed if you want backend token validation
 */

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// JWKS client for Azure B2C
const client = jwksClient({
  jwksUri: 'https://cloudlabsqaai.b2clogin.com/cloudlabsqaai.onmicrosoft.com/B2C_1A_signup_signin_linkedin/discovery/v2.0/keys',
  requestHeaders: {}, // Optional
  timeout: 30000, // Defaults to 30s
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

/**
 * Middleware to validate Azure B2C JWT tokens
 */
function validateAzureB2CToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No valid authorization header' });
  }

  const token = authHeader.substring(7);

  jwt.verify(token, getKey, {
    audience: 'e76ca0fd-0545-4b4f-ba26-aa96f8999f4a', // Your client ID
    issuer: 'https://cloudlabsqaai.b2clogin.com/dd1da7a2-61b9-44ff-9c68-5fae266bd396/v2.0/', // Your tenant issuer
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      console.error('Token validation failed:', err);
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Token is valid, attach user info to request
    req.user = {
      id: decoded.sub,
      email: decoded.emails?.[0] || decoded.email,
      name: decoded.name || decoded.given_name + ' ' + decoded.family_name,
      roles: decoded.extension_roles || [] // If you have custom roles
    };

    next();
  });
}

// Example usage in your Express routes:
/*
app.get('/api/protected', validateAzureB2CToken, (req, res) => {
  res.json({ 
    message: 'This is a protected route',
    user: req.user 
  });
});
*/

module.exports = { validateAzureB2CToken };
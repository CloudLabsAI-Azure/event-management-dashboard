const fs = require('fs');
const path = require('path');

// Path to data.json file
const DATA_FILE_PATH = path.join(__dirname, 'data.json');

/**
 * Validates if a user exists in data.json and returns their role
 * @param {string} email - User's email from B2C authentication
 * @returns {Object} - {isValid: boolean, user: Object|null, role: string|null}
 */
function validateUserByEmail(email) {
  try {
    // Read data.json file
    const data = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf8'));
    
    // Find user by email in the users array
    const user = data.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    
    if (user) {
      return {
        isValid: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        role: user.role
      };
    }
    
    return {
      isValid: false,
      user: null,
      role: null,
      message: 'User not found in authorized user list'
    };
    
  } catch (error) {
    console.error('Error validating user:', error);
    return {
      isValid: false,
      user: null,
      role: null,
      message: 'Error validating user credentials'
    };
  }
}

/**
 * Gets all users for admin purposes
 * @returns {Array} - Array of users
 */
function getAllUsers() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf8'));
    return data.users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    }));
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

module.exports = {
  validateUserByEmail,
  getAllUsers
};
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer storage to save files locally in the '../uploads' folder
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // limit to 5MB
});

// Example Profile Update Route handling image upload
// Make sure this matches your existing user update route endpoint (e.g., PUT /api/users/profile)
router.put('/profile', upload.single('profileImage'), async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        
        // If a file was uploaded, generate its relative access path
        let profileImageUrl = req.body.profileImageUrl; // fallback if unchanged
        if (req.file) {
            profileImageUrl = `/uploads/${req.file.filename}`;
        }

        // TODO: Save 'name', 'email', 'phone', and 'profileImageUrl' to your database here!
        // Example: const updatedUser = await User.findByIdAndUpdate(req.user.id, { name, email, phone, profileImageUrl }, { new: true });

        res.status(200).json({
            message: 'Profile updated successfully',
            user: {
                name,
                email,
                phone,
                profileImageUrl
            }
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Server error updating profile' });
    }
});

module.exports = router;
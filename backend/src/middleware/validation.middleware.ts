import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const validateEmail = body('email').isEmail().normalizeEmail();
export const validatePassword = body('password').isLength({ min: 6 });
export const validateUsername = body('username').isLength({ min: 3 });
export const validateFullName = body('fullName').notEmpty();

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Question validation
export const validateQuestion = [
  body('content').notEmpty().withMessage('Question content is required'),
  body('type').isIn(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']).withMessage('Invalid question type'),
  body('subject').notEmpty().withMessage('Subject is required'),
  body('topic').notEmpty().withMessage('Topic is required'),
  body('difficulty').isIn(['EASY', 'MEDIUM', 'HARD']).withMessage('Invalid difficulty level'),
  body('correctAnswer').notEmpty().withMessage('Correct answer is required'),
];

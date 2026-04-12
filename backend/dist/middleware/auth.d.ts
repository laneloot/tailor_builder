import { Request, Response, NextFunction } from 'express';
export declare function generateToken(): string;
export declare function validatePassword(password: string): boolean;
export declare function invalidateToken(token: string): void;
export declare function authMiddleware(req: Request, res: Response, next: NextFunction): void;
export declare function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map
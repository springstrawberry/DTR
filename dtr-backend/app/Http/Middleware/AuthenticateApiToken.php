<?php

namespace App\Http\Middleware;

use App\Services\AuthService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateApiToken
{
    public function __construct(private readonly AuthService $authService)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $this->authService->currentUserFromToken($request->bearerToken());

        if ($user === null) {
            return new JsonResponse([
                'message' => 'Unauthenticated.',
            ], 401);
        }

        Auth::setUser($user);
        $request->setUserResolver(static fn () => $user);

        return $next($request);
    }
}

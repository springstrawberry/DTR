<?php

namespace App\Services;

use App\Models\ApiToken;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthService
{
    public function register(array $data): array
    {
        $user = User::query()->create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        return $this->issueTokenResponse($user);
    }

    public function login(array $credentials): array
    {
        $user = User::query()
            ->where('email', $credentials['email'])
            ->first();

        if ($user === null || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        return $this->issueTokenResponse($user);
    }

    public function currentUserFromToken(?string $plainTextToken): ?User
    {
        $apiToken = $this->findToken($plainTextToken);

        if ($apiToken === null) {
            return null;
        }

        $apiToken->forceFill([
            'last_used_at' => now(),
        ])->save();

        return $apiToken->user;
    }

    public function revokeToken(?string $plainTextToken): void
    {
        if (! is_string($plainTextToken) || trim($plainTextToken) === '') {
            return;
        }

        ApiToken::query()
            ->where('token', hash('sha256', $plainTextToken))
            ->delete();
    }

    public function serializeUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ];
    }

    private function issueTokenResponse(User $user): array
    {
        $plainTextToken = Str::random(80);

        $user->apiTokens()->create([
            'token' => hash('sha256', $plainTextToken),
        ]);

        return [
            'token' => $plainTextToken,
            'token_type' => 'Bearer',
            'user' => $this->serializeUser($user),
        ];
    }

    private function findToken(?string $plainTextToken): ?ApiToken
    {
        if (! is_string($plainTextToken) || trim($plainTextToken) === '') {
            return null;
        }

        return ApiToken::query()
            ->where('token', hash('sha256', $plainTextToken))
            ->with('user')
            ->first();
    }
}

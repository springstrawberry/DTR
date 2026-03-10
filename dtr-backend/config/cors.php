<?php

$configuredOrigins = array_filter(array_map(
    static fn (string $origin): string => trim($origin),
    explode(',', (string) env('FRONTEND_URLS', env('FRONTEND_URL', '')))
));

$defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://dtr-2.onrender.com',
];

return [
    'paths' => ['api/*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => array_values(array_unique([
        ...$defaultOrigins,
        ...$configuredOrigins,
    ])),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('d_t_r_logs') && ! Schema::hasTable('dtrlogs')) {
            Schema::rename('d_t_r_logs', 'dtrlogs');
        }

        foreach ([
            'failed_jobs',
            'job_batches',
            'jobs',
            'cache_locks',
            'cache',
            'sessions',
            'password_reset_tokens',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // This cleanup is intended to converge older databases to the lean schema.
    }
};

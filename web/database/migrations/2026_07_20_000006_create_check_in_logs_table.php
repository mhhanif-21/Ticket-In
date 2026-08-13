<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('check_in_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('check_in_session_id')->constrained('check_in_sessions')->cascadeOnDelete();
            $table->foreignUuid('registration_id')->nullable()->constrained('registrations')->nullOnDelete();
            $table->string('scanned_ticket_code', 50);
            $table->string('scan_method');
            $table->string('scan_status');
            $table->timestamp('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('check_in_logs');
    }
};

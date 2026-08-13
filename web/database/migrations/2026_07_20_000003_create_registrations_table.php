<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('registrations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('event_id')->constrained('events')->cascadeOnDelete();
            $table->string('name');
            $table->string('email');
            $table->jsonb('answers')->nullable();
            $table->string('status');
            $table->string('ticket_code', 8)->unique()->nullable();
            $table->text('qr_code_url')->nullable();
            $table->string('presence_status')->default('Absent');
            $table->timestamps();
            
            $table->index(['event_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('registrations');
    }
};

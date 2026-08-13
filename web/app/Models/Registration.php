<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Registration extends Model
{
    use HasUuids;

    protected $fillable = [
        'event_id', 'name', 'email', 'answers', 'status', 
        'ticket_code', 'qr_code_url', 'presence_status'
    ];

    protected $casts = [
        'answers' => 'array',
    ];

    public function event()
    {
        return $this->belongsTo(Event::class);
    }

    public function otps()
    {
        return $this->hasMany(Otp::class);
    }

    public function checkInLogs()
    {
        return $this->hasMany(CheckInLog::class);
    }
}

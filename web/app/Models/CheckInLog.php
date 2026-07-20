<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class CheckInLog extends Model
{
    use HasUuids;

    const UPDATED_AT = null;

    protected $fillable = [
        'check_in_session_id', 'registration_id', 'scanned_ticket_code', 
        'scan_method', 'scan_status', 'created_at'
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function checkInSession()
    {
        return $this->belongsTo(CheckInSession::class);
    }

    public function registration()
    {
        return $this->belongsTo(Registration::class);
    }
}

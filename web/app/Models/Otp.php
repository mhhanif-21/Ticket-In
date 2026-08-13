<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Otp extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'registration_id', 'otp_code', 'expires_at', 'is_used'
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'is_used' => 'boolean',
    ];

    public function registration()
    {
        return $this->belongsTo(Registration::class);
    }
}

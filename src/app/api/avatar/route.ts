import { NextRequest, NextResponse } from 'next/server';

/**
 * 头像 API - 本地存储模式
 * 
 * 注意：头像现在直接存储在 localStorage 中 (key: avatar_${userId})
 * 这个 API 保留以兼容可能的调用，但返回空响应
 */

// 获取用户头像 - 本地存储模式
export async function GET(_request: NextRequest) {
  // 头像现在直接存储在 localStorage 中
  // 前端从 localStorage.getItem(`avatar_${userId}`) 获取
  return NextResponse.json({ avatarUrl: null });
}

// 上传头像 - 本地存储模式
export async function POST(_request: NextRequest) {
  // 头像上传现在直接在前端处理为 base64 并存储在 localStorage
  // 不需要后端 API
  return NextResponse.json({ 
    message: '请使用前端本地存储',
    avatarUrl: null 
  });
}

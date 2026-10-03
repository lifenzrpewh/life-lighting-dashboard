// A 16-bit Spout sender: a stand-in for Arena with High Detail on, so LIFE's
// 16-bit build of texture-bridge (native/texture-bridge/) can be proven without
// changing Arena's settings. docs/VISUALS_DASHBOARD.md § 16-bit.
//
// spikes/spout-test-sender.cjs cannot do this: Electron paints only BGRA8. So
// this makes the texture itself, R16G16B16A16_UNORM (DXGI format 11, what Arena
// publishes with High Detail on), and registers it the way Spout2 does
// (SpoutSenderNames.cpp, SpoutFrameCount.cpp at c2bcc12): a name in the
// "SpoutSenderNames" list, the texture's legacy share handle in a 280-byte map
// named after the sender, a frame-count semaphore and an access mutex.
//
// Built with the C# compiler every Windows has, so no SDK and no admin:
//
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /platform:x64 /unsafe /out:%TEMP%\spout-16bit-sender.exe spikes\spout-16bit-sender.cs
//   %TEMP%\spout-16bit-sender.exe [name] [width] [height] [fps] [seconds]
//
// THE PICTURE, chosen so every 8-bit value it should become is exact: a 16-bit
// value v*257 is v/255 of full scale, so the GPU's conversion writes v. Top half,
// four patches left to right:
//   red     (255,   0,   0)
//   green   (  0, 128,   0)
//   blue    (  0,   0,  64)
//   grey    (200, 200, 200)
// Bottom half: a grey ramp, 0 at the left to 65535 at the right, and a white bar
// one-twentieth of the width moving across it a step a frame, so a stalled
// picture shows.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static unsafe class Spout16BitSender
{
	// The patches, as 8-bit values; each is sent as v*257.
	static readonly int[][] Patches = {
		new[] { 255, 0, 0 }, new[] { 0, 128, 0 }, new[] { 0, 0, 64 }, new[] { 200, 200, 200 },
	};

	const int DXGI_FORMAT_R16G16B16A16_UNORM = 11;
	const int NameLen = 256;          // SpoutMaxSenderNameLen
	const int DefaultMaxSenders = 64; // SpoutSenderNames' default
	const int InfoSize = 280;         // sizeof(SharedTextureInfo)

	static int Main(string[] args)
	{
		string name = args.Length > 0 ? args[0] : "LIFE 16-bit test";
		int width = args.Length > 1 ? int.Parse(args[1]) : 1280;
		int height = args.Length > 2 ? int.Parse(args[2]) : 720;
		int fps = args.Length > 3 ? int.Parse(args[3]) : 30;
		int seconds = args.Length > 4 ? int.Parse(args[4]) : 0; // 0: until Ctrl+C

		IntPtr device, context;
		int level;
		Check(D3D11CreateDevice(IntPtr.Zero, 1 /* HARDWARE */, IntPtr.Zero, 0, IntPtr.Zero, 0, 7 /* SDK */, out device, out level, out context), "D3D11CreateDevice");

		ushort[] pixels = new ushort[width * height * 4];
		Paint(pixels, width, height, 0);

		// A texture a receiver can read as a shader input or copy, shared by a
		// legacy handle, as Spout senders do.
		var desc = new TextureDesc {
			Width = (uint)width, Height = (uint)height, MipLevels = 1, ArraySize = 1,
			Format = DXGI_FORMAT_R16G16B16A16_UNORM, SampleCount = 1, SampleQuality = 0,
			Usage = 0 /* DEFAULT */, BindFlags = 0x8 | 0x20 /* SHADER_RESOURCE | RENDER_TARGET */,
			CPUAccessFlags = 0, MiscFlags = 0x2 /* SHARED */,
		};
		IntPtr texture;
		fixed (ushort* p = pixels)
		{
			var init = new SubresourceData { SysMem = (IntPtr)p, SysMemPitch = (uint)(width * 8), SysMemSlicePitch = 0 };
			Check(Call<CreateTexture2DFn>(device, 5)(device, ref desc, ref init, out texture), "CreateTexture2D");
		}
		Guid iidResource = new Guid("035f3ab4-482e-4e50-b41f-8a7f8bd8960b");
		IntPtr dxgiResource, shareHandle;
		Check(Call<QueryInterfaceFn>(texture, 0)(texture, ref iidResource, out dxgiResource), "QueryInterface IDXGIResource");
		Check(Call<GetSharedHandleFn>(dxgiResource, 8)(dxgiResource, out shareHandle), "GetSharedHandle");

		// The sender's own map: share handle, size, format, and who made it.
		IntPtr infoMutex;
		IntPtr infoMap = CreateMap(name, InfoSize, out infoMutex);
		byte* info = (byte*)MapViewOfFile(infoMap, 0xF001F, 0, 0, UIntPtr.Zero);
		if (info == null) throw new Exception("MapViewOfFile " + name);
		WaitForSingleObject(infoMutex, 67);
		for (int i = 0; i < InfoSize; i++) info[i] = 0;
		*(uint*)(info + 0) = (uint)shareHandle.ToInt64();
		*(uint*)(info + 4) = (uint)width;
		*(uint*)(info + 8) = (uint)height;
		*(uint*)(info + 12) = DXGI_FORMAT_R16G16B16A16_UNORM;
		*(uint*)(info + 16) = 0;
		byte[] path = Encoding.ASCII.GetBytes(Process.GetCurrentProcess().MainModule.FileName);
		for (int i = 0; i < Math.Min(path.Length, 255); i++) info[20 + i] = path[i];
		ReleaseMutex(infoMutex);

		IntPtr semaphore = CreateSemaphoreA(IntPtr.Zero, 1, int.MaxValue, name + "_Count_Semaphore");
		IntPtr access = CreateMutexA(IntPtr.Zero, false, name + "_SpoutAccessMutex");
		Register(name, true);

		bool running = true;
		Console.CancelKeyPress += (s, e) => { e.Cancel = true; running = false; };
		Console.WriteLine("Spout sender \"{0}\", {1}x{2} R16G16B16A16_UNORM at {3} fps{4}. Ctrl+C to stop.",
			name, width, height, fps, seconds > 0 ? ", for " + seconds + " s" : "");

		var update = Call<UpdateSubresourceFn>(context, 48);
		var flush = Call<FlushFn>(context, 111);
		var clock = Stopwatch.StartNew();
		long frame = 0;
		try
		{
			while (running && (seconds == 0 || clock.Elapsed.TotalSeconds < seconds))
			{
				frame++;
				Paint(pixels, width, height, frame);
				WaitForSingleObject(access, 67);
				fixed (ushort* p = pixels) update(context, texture, 0, IntPtr.Zero, (IntPtr)p, (uint)(width * 8), 0);
				flush(context);
				ReleaseMutex(access);
				// SpoutFrameCount::SetNewFrame: take one, give back two.
				if (WaitForSingleObject(semaphore, 0) == 0) ReleaseSemaphore(semaphore, 2, IntPtr.Zero);
				if (frame % (fps * 5) == 0) Console.WriteLine("{0} frames, {1:0.0} fps", frame, frame / clock.Elapsed.TotalSeconds);
				long due = (long)(frame * 1000.0 / fps);
				long wait = due - clock.ElapsedMilliseconds;
				if (wait > 0) Thread.Sleep((int)wait);
			}
		}
		finally
		{
			Register(name, false);
			Console.WriteLine("released \"{0}\" after {1} frames", name, frame);
		}
		return 0;
	}

	static void Paint(ushort[] px, int w, int h, long frame)
	{
		int half = h / 2, bar = Math.Max(1, w / 20);
		int barAt = (int)((frame * 8) % w);
		for (int y = 0; y < h; y++)
		{
			for (int x = 0; x < w; x++)
			{
				int o = (y * w + x) * 4;
				ushort r, g, b;
				if (y < half)
				{
					int[] c = Patches[Math.Min(3, x * 4 / w)];
					r = (ushort)(c[0] * 257); g = (ushort)(c[1] * 257); b = (ushort)(c[2] * 257);
				}
				else if (x >= barAt && x < barAt + bar) { r = g = b = 65535; }
				else { r = g = b = (ushort)((long)x * 65535 / (w - 1)); }
				px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 65535;
			}
		}
	}

	/// <summary>Add the name to Spout's list of senders, or take it off. The list
	/// is fixed 256-byte slots, sorted byte-wise as a std::set writes it.</summary>
	static void Register(string name, bool add)
	{
		IntPtr mutex;
		IntPtr map = CreateMap("SpoutSenderNames", DefaultMaxSenders * NameLen, out mutex);
		byte* buf = (byte*)MapViewOfFile(map, 0xF001F, 0, 0, UIntPtr.Zero);
		if (buf == null) throw new Exception("MapViewOfFile SpoutSenderNames");
		// A map made by an older Spout may be smaller; never write past it.
		var mbi = new MemoryBasicInformation();
		VirtualQuery((IntPtr)buf, out mbi, (UIntPtr)Marshal.SizeOf(typeof(MemoryBasicInformation)));
		int slots = Math.Min(DefaultMaxSenders, (int)((long)mbi.RegionSize / NameLen));
		if (WaitForSingleObject(mutex, 67) != 0) throw new Exception("SpoutSenderNames is locked");
		try
		{
			var names = new SortedSet<string>(StringComparer.Ordinal);
			for (int i = 0; i < slots; i++)
			{
				byte* slot = buf + i * NameLen;
				if (slot[0] == 0) break;
				int n = 0;
				while (n < NameLen && slot[n] != 0) n++;
				names.Add(Encoding.ASCII.GetString(ToArray(slot, n)));
			}
			if (add) names.Add(name); else names.Remove(name);
			for (int i = 0; i < slots * NameLen; i++) buf[i] = 0;
			int k = 0;
			foreach (string s in names)
			{
				if (k == slots) break;
				byte[] b = Encoding.ASCII.GetBytes(s);
				for (int j = 0; j < Math.Min(b.Length, NameLen - 1); j++) buf[k * NameLen + j] = b[j];
				k++;
			}
		}
		finally { ReleaseMutex(mutex); }
	}

	static byte[] ToArray(byte* p, int n) { var a = new byte[n]; for (int i = 0; i < n; i++) a[i] = p[i]; return a; }

	static IntPtr CreateMap(string name, int size, out IntPtr mutex)
	{
		IntPtr map = CreateFileMappingA(new IntPtr(-1), IntPtr.Zero, 4 /* PAGE_READWRITE */, 0, (uint)size, name);
		if (map == IntPtr.Zero) throw new Exception("CreateFileMapping " + name + ": " + Marshal.GetLastWin32Error());
		mutex = CreateMutexA(IntPtr.Zero, false, name + "_mutex");
		return map;
	}

	static void Check(int hr, string what) { if (hr < 0) throw new Exception(what + " failed, hr=0x" + hr.ToString("X8")); }

	static T Call<T>(IntPtr com, int slot) where T : class
	{
		IntPtr vtable = Marshal.ReadIntPtr(com);
		return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vtable, slot * IntPtr.Size), typeof(T));
	}

	[StructLayout(LayoutKind.Sequential)]
	struct TextureDesc
	{
		public uint Width, Height, MipLevels, ArraySize; public int Format;
		public uint SampleCount, SampleQuality; public int Usage; public uint BindFlags, CPUAccessFlags, MiscFlags;
	}

	[StructLayout(LayoutKind.Sequential)]
	struct SubresourceData { public IntPtr SysMem; public uint SysMemPitch, SysMemSlicePitch; }

	[StructLayout(LayoutKind.Sequential)]
	struct MemoryBasicInformation
	{
		public IntPtr BaseAddress, AllocationBase; public uint AllocationProtect; public IntPtr RegionSize;
		public uint State, Protect, Type;
	}

	[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int QueryInterfaceFn(IntPtr self, ref Guid iid, out IntPtr obj);
	[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateTexture2DFn(IntPtr self, ref TextureDesc desc, ref SubresourceData init, out IntPtr texture);
	[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetSharedHandleFn(IntPtr self, out IntPtr handle);
	[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void UpdateSubresourceFn(IntPtr self, IntPtr dst, uint sub, IntPtr box, IntPtr src, uint rowPitch, uint depthPitch);
	[UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void FlushFn(IntPtr self);

	[DllImport("d3d11.dll")] static extern int D3D11CreateDevice(IntPtr adapter, int driverType, IntPtr software, uint flags, IntPtr levels, uint numLevels, uint sdk, out IntPtr device, out int level, out IntPtr context);
	[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)] static extern IntPtr CreateFileMappingA(IntPtr file, IntPtr attrs, uint protect, uint sizeHigh, uint sizeLow, string name);
	[DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr MapViewOfFile(IntPtr map, uint access, uint offHigh, uint offLow, UIntPtr bytes);
	[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)] static extern IntPtr CreateMutexA(IntPtr attrs, bool owned, string name);
	[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)] static extern IntPtr CreateSemaphoreA(IntPtr attrs, int initial, int max, string name);
	[DllImport("kernel32.dll")] static extern bool ReleaseSemaphore(IntPtr sem, int count, IntPtr previous);
	[DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint ms);
	[DllImport("kernel32.dll")] static extern bool ReleaseMutex(IntPtr mutex);
	[DllImport("kernel32.dll")] static extern UIntPtr VirtualQuery(IntPtr address, out MemoryBasicInformation info, UIntPtr length);
}

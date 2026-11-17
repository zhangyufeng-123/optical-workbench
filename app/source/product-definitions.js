// Official dimension/photo references are recorded in each product metadata.
// Flexible lead parking and unsupported cosmetic dimensions are explicitly illustrative.
export const PRODUCT_DEFINITIONS = {
  "laser": {
    "id": "laser",
    "name": "Thorlabs DFB13TK 1310 nm 光纤光源",
    "category": "光源",
    "shape": "product",
    "size": [
      254,
      75,
      149.5
    ],
    "ports": [
      {
        "id": "out",
        "label": "FC/APC 光输出",
        "pos": [
          -35.3,
          42.3,
          75.5
        ],
        "dir": [
          0,
          0,
          1
        ],
        "role": "out",
        "connector": "FC/APC",
        "kind": "optical",
        "gender": "female"
      }
    ],
    "code": "DFB13TK",
    "note": "依据官方外形与照片参数化重建，接口配合面与模型同步；显示尾纤停放及未标注细节为示意。",
    "source": "https://www.thorlabs.com/item/dfb13tk",
    "color": "#ac252d",
    "representation": "parameterized_product_reference",
    "sizeBasis": "官方机身尺寸，整件包围尺寸含示意接口与停放尾纤 / mm",
    "product": {
      "kind": "laser",
      "manufacturer": "Thorlabs",
      "model": "DFB13TK",
      "bodySize": [
        254,
        74.6,
        135
      ],
      "bodyColor": "#ac252d",
      "frontColor": "#20262b",
      "sources": [
        {
          "kind": "product_page",
          "url": "https://www.thorlabs.com/item/dfb13tk"
        },
        {
          "kind": "product_photo",
          "url": "https://media.thorlabs.com/globalassets/items/d/df/dfb/dfb13tk/ttn339662.webp?v=1115051302&v=2025-11-15-17-13-02"
        },
        {
          "kind": "CAD PDF",
          "url": "https://media.thorlabs.com/globalassets/items/d/df/dfb/dfb13tk/ttn339662-e0w.pdf?v=0623060443",
          "file": "DFB13TK_TTN339662-E0W.pdf",
          "sha256": "eb7d80254d6f4541f7c4953faeb98c22b4061832c6391427ba3d567585a9449e"
        },
        {
          "kind": "Step",
          "url": "https://media.thorlabs.com/globalassets/items/d/df/dfb/dfb13tk/ttn339662-e0w.step?v=0623060449",
          "file": "cad/DFB13TK_TTN339662-E0W.step",
          "sha256": "fa49a80247d5244270bddc3a41a1ef4aa438dd87e6557e0baf9e9a85c5473d9e"
        },
        {
          "kind": "Manual",
          "url": "https://media.thorlabs.com/globalassets/items/d/df/dfb/dfb13tk/ttn339662-d02.pdf?v=0623060449",
          "file": "DFB13TK_TTN339662-D02.pdf",
          "sha256": "e4d65d477f8adcf751ae9d82b3c6f3d38d5393257e9c3388dc07cd13444c9af5"
        }
      ],
      "metadata": {
        "representation": "commercial_reference",
        "officialGeometry": {
          "body_size_mm_xyz": [
            254.0,
            74.6,
            135.0
          ],
          "scope": "Mounting-plate width, overall height and 135 mm chassis depth. Protruding optical and electrical connectors extend beyond this chassis depth and are included in the complete illustration envelope defined by size.",
          "dimension_evidence": "manufacturer_dimension_drawing",
          "drawing": "DFB13TK_TTN339662-E0W.pdf",
          "enclosure_width_mm": 193.9,
          "base_plate_thickness_mm": 5.4,
          "mounting_span_mm": {
            "metric_long_axis": 225.0,
            "imperial_long_axis": 228.6,
            "metric_depth_axis": 75.0,
            "imperial_depth_axis": 76.2
          },
          "appearance": "Red finned enclosure, black front and rear panels, mounting flanges, three SMA modulation sockets, push button and status LEDs",
          "appearance_evidence": "DFB13TK_product.webp and CAD PDF",
          "display_screen": false
        },
        "opticalSpecifications": {
          "nominal_wavelength_nm": 1310,
          "factory_preset_center_wavelength_nm": [
            1305,
            1315
          ],
          "linewidth_khz": {
            "typical": 100,
            "maximum": 200
          },
          "output_power_mw_at_factory_preset": {
            "minimum": 100
          },
          "fiber_type": "PM1300",
          "output_connector": "FC/APC",
          "key_width_mm": 2.0,
          "spec_source": "DFB13TK_TTN339662-D02.pdf, Chapter 1.4.1"
        },
        "nominalPigtails": {},
        "sourceManifest": "products-research.json",
        "referenceOnly": true
      },
      "estimatedDetails": [
        "光口轴中心 X=-35.3 mm、Y=42.3 mm 采用官方尺寸图。配合面 Z=75.5 mm 按机壳前沿与外露接头装配确定。",
        "通风槽、文字排版、SMA、USB、M8和开关外观参照照片；未逐项进行CAD尺寸拟合。"
      ],
      "chassisSize": [
        193.9,
        69.2,
        135
      ],
      "baseThickness": 5.4,
      "baseDepth": 120.7
    }
  },
  "polarizer": {
    "id": "polarizer",
    "name": "Thorlabs ILP1310PM-FC 在线起偏器",
    "category": "偏振与样品",
    "shape": "product",
    "size": [
      246,
      12,
      82
    ],
    "ports": [
      {
        "id": "in",
        "label": "FC/PC 输入尾纤",
        "pos": [
          -120,
          7,
          45
        ],
        "dir": [
          -1,
          0,
          0
        ],
        "role": "in",
        "connector": "FC/PC",
        "kind": "optical",
        "gender": "male",
        "pigtailEnd": true
      },
      {
        "id": "out",
        "label": "FC/PC 输出尾纤",
        "pos": [
          120,
          7,
          45
        ],
        "dir": [
          1,
          0,
          0
        ],
        "role": "out",
        "connector": "FC/PC",
        "kind": "optical",
        "gender": "male",
        "pigtailEnd": true
      }
    ],
    "code": "ILP1310PM-FC",
    "note": "依据官方外形与照片参数化重建，接口配合面与模型同步；显示尾纤停放及未标注细节为示意。",
    "source": "https://www.thorlabs.com/item/ilp1310pm-fc",
    "color": "#bcc5ca",
    "representation": "parameterized_product_reference",
    "sizeBasis": "官方机身尺寸，整件包围尺寸含示意接口与停放尾纤 / mm",
    "product": {
      "kind": "polarizer",
      "manufacturer": "Thorlabs",
      "model": "ILP1310PM-FC",
      "bodySize": [
        35,
        5.5,
        5.5
      ],
      "bodyColor": "#bcc5ca",
      "frontColor": "#20262b",
      "sources": [
        {
          "kind": "product_page",
          "url": "https://www.thorlabs.com/item/ilp1310pm-fc"
        },
        {
          "kind": "product_photo",
          "url": "https://media.thorlabs.com/globalassets/items/i/il/ilp/ilp1310pm-fc/23345.webp?v=1115085222&v=2025-11-15-20-52-22"
        },
        {
          "kind": "CAD PDF",
          "url": "https://media.thorlabs.com/globalassets/items/i/il/ilp/ilp1310pm-fc/23345-e0w.pdf?v=0116115419",
          "file": "ILP1310PM-FC_23345-E0W.pdf",
          "sha256": "37eb28a20d3eb739de57b035bac330ce3f43b21f9221da6eefb75731a5d19a39"
        },
        {
          "kind": "Step",
          "url": "https://media.thorlabs.com/globalassets/items/i/il/ilp/ilp1310pm-fc/23345-e0w.step?v=0116115421",
          "file": "cad/ILP1310PM-FC_23345-E0W.step",
          "sha256": "fd30efcfb99ad585a424a5b3c136c92feb17317b5b3a3d42a9e48057a25b02e9"
        }
      ],
      "metadata": {
        "representation": "commercial_reference",
        "officialGeometry": {
          "body_size_mm_xyz": [
            35.0,
            5.5,
            5.5
          ],
          "scope": "Cylindrical optical package only, placed with its axis along X",
          "diameter_mm": 5.5,
          "length_mm": 35.0,
          "dimension_evidence": "manufacturer_dimension_drawing",
          "drawing": "ILP1310PM-FC_23345-E0W.pdf",
          "appearance": "Small stainless-steel cylindrical package, blue 900 micrometre loose tubing and black boots on FC/PC cable-end connectors"
        },
        "opticalSpecifications": {
          "center_wavelength_nm": 1310,
          "bandwidth_nm_plus_minus": 50,
          "fiber_type": "Fujikura SM13-PS-U25D PM/PM",
          "insertion_loss_db": {
            "typical": 0.6,
            "maximum": 0.8
          },
          "extinction_ratio_db": {
            "minimum": 26,
            "typical": 28
          },
          "power_handling_mw_maximum": 300,
          "connector": "FC/PC",
          "key_width_mm": 2.0,
          "connector_key_alignment": "slow axis",
          "spec_source": "ILP1310PM-FC_23345-E0W.pdf specifications table"
        },
        "nominalPigtails": {
          "count": 2,
          "length_mm_each": {
            "minimum": 800,
            "maximum": 875
          },
          "jacket_diameter_mm": 0.9,
          "jacket_color": "blue",
          "termination": "FC/PC male, 2.0 mm narrow key, black 900 micrometre boot",
          "evidence": "Official CAD labels 0.8m +0.075/-0.0 at two places"
        },
        "sourceManifest": "products-research.json",
        "referenceOnly": true
      },
      "estimatedDetails": [
        "本体 Ø5.5×35 mm、蓝色 Ø0.9 mm 尾纤与黑色FC/PC尾套采用官方图纸和照片。",
        "两个公头为可视化停放位置。显示纤段为缩短的布局示意，官方每端 800–875 mm 尾纤长度保留在元数据。"
      ],
      "capsuleSize": [
        35,
        5.5
      ],
      "axisHeight": 2.75,
      "fiberColor": "#315ba5",
      "pigtailBootColor": "#151a20",
      "pigtails": [
        {
          "portId": "in",
          "exit": [
            -17.5,
            2.75,
            0
          ],
          "exitDirection": [
            -1,
            0,
            0
          ],
          "points": [
            [
              -42,
              3,
              -25
            ],
            [
              -68,
              5,
              8
            ]
          ],
          "radius": 0.45
        },
        {
          "portId": "out",
          "exit": [
            17.5,
            2.75,
            0
          ],
          "exitDirection": [
            1,
            0,
            0
          ],
          "points": [
            [
              42,
              3,
              -25
            ],
            [
              68,
              5,
              8
            ]
          ],
          "radius": 0.45
        }
      ]
    }
  },
  "paddle": {
    "id": "paddle",
    "name": "Thorlabs FPC031 三桨偏振控制器",
    "category": "偏振与样品",
    "shape": "product",
    "size": [
      320,
      64,
      86
    ],
    "ports": [
      {
        "id": "in",
        "label": "FC/PC 输入尾纤",
        "pos": [
          -155,
          12,
          60
        ],
        "dir": [
          -1,
          0,
          0
        ],
        "role": "in",
        "connector": "FC/PC",
        "kind": "optical",
        "gender": "male",
        "pigtailEnd": true
      },
      {
        "id": "out",
        "label": "FC/PC 输出尾纤",
        "pos": [
          155,
          12,
          60
        ],
        "dir": [
          1,
          0,
          0
        ],
        "role": "out",
        "connector": "FC/PC",
        "kind": "optical",
        "gender": "male",
        "pigtailEnd": true
      }
    ],
    "code": "FPC031",
    "note": "依据官方外形与照片参数化重建，接口配合面与模型同步；显示尾纤停放及未标注细节为示意。",
    "source": "https://www.thorlabs.com/item/fpc031",
    "color": "#22282b",
    "representation": "parameterized_product_reference",
    "sizeBasis": "官方机身尺寸，整件包围尺寸含示意接口与停放尾纤 / mm",
    "product": {
      "kind": "paddle",
      "manufacturer": "Thorlabs",
      "model": "FPC031",
      "bodySize": [
        215.9,
        63,
        25.4
      ],
      "bodyColor": "#22282b",
      "frontColor": "#20262b",
      "sources": [
        {
          "kind": "product_page",
          "url": "https://www.thorlabs.com/item/fpc031"
        },
        {
          "kind": "product_photo",
          "url": "https://media.thorlabs.com/globalassets/items/f/fp/fpc/fpc031/5298.webp?v=1115071303&v=2025-11-15-19-13-03"
        },
        {
          "kind": "CAD PDF",
          "url": "https://media.thorlabs.com/globalassets/items/f/fp/fpc/fpc031/5298-e0w.pdf?v=0116113701",
          "file": "FPC031_5298-E0W.pdf",
          "sha256": "2867e4c11d62b6887a17e3409d9be2bbae5dc6d12a9b88e6d11c13809d26f718"
        },
        {
          "kind": "Step",
          "url": "https://media.thorlabs.com/globalassets/items/f/fp/fpc/fpc031/5298-e0w.step?v=0116113705",
          "file": "cad/FPC031_5298-E0W.step",
          "sha256": "d3b89ad0a2977a1cd722da4076e0b4b08d898ce6477646a91ad0932af0eba9f3"
        },
        {
          "kind": "Manual",
          "url": "https://media.thorlabs.com/globalassets/items/f/fp/fpc/fpc031/1167-d02.pdf?v=0116113713",
          "file": "FPC031_1167-D02.pdf",
          "sha256": "f729f0c2b5d60567f733049c55e846c07ad50751b770cf3be4ddedbc5849b4cc"
        }
      ],
      "metadata": {
        "representation": "commercial_reference",
        "officialGeometry": {
          "body_size_mm_xyz": [
            215.9,
            63.0,
            25.4
          ],
          "scope": "Paddles upright, narrowest footprint",
          "maximum_rotation_depth_mm": 63.8,
          "loop_diameter_mm": 27.0,
          "paddle_cover_diameter_mm": 31.8,
          "paddle_thickness_mm": 6.4,
          "base_thickness_mm": 9.5,
          "paddle_cover_centers_from_left_mm": [
            57.2,
            108.0,
            158.8
          ],
          "paddle_rotation_deg_plus_minus": 117.5,
          "dimension_evidence": "manufacturer_dimension_drawing",
          "drawing": "FPC031_5298-E0W.pdf",
          "appearance": "Black Delrin three-paddle controller, black base and clamping blocks, preloaded 900 micrometre fiber"
        },
        "opticalSpecifications": {
          "operating_wavelength_nm": [
            1260,
            1625
          ],
          "design_wavelength_nm": [
            1310,
            1550
          ],
          "fiber_type": "Corning ClearCurve CCC1310-J9",
          "connector": "FC/PC",
          "preloaded_fiber_total_length_mm": 2000,
          "preloaded_loop_counts": [
            4,
            3,
            4
          ],
          "spec_source": "FPC031_1167-D02.pdf Chapter 4.2 and FPC031_5298-E0W.pdf"
        },
        "nominalPigtails": {
          "count": 2,
          "jacket_diameter_mm": 0.9,
          "termination": "FC/PC male",
          "total_installed_fiber_length_mm": 2000,
          "tail_position_note": "Flexible external lead positions depend on routing. The official CAD specifies the total included fiber length as 2 m and omits that fiber from the mechanical model."
        },
        "sourceManifest": "products-research.json",
        "referenceOnly": true
      },
      "estimatedDetails": [
        "基座 215.9×25.4 mm、总高 63 mm、桨盖Ø31.8 mm、绕纤直径27 mm、4-3-4圈来自官方资料。",
        "桨板角度用于展示可转结构；夹具出纤位置、端头停放和外部柔性纤段路径为装配示意。预装纤维总长2m保留于元数据。"
      ],
      "baseHeight": 9.5,
      "paddleDiameter": 27,
      "coverDiameter": 31.8,
      "axisHeight": 31.1,
      "paddlePositions": [
        -50.75,
        0.04999999999999716,
        50.85000000000001
      ],
      "paddleAngles": [
        -16,
        8,
        24
      ],
      "paddleLoops": [
        4,
        3,
        4
      ],
      "fiberColor": "#ddd7b7",
      "pigtailBootColor": "#e2cf58",
      "pigtails": [
        {
          "portId": "in",
          "exit": [
            -95.25,
            31.1,
            0
          ],
          "exitDirection": [
            -1,
            0,
            0
          ],
          "points": [
            [
              -116,
              27,
              25
            ],
            [
              -114,
              12,
              43
            ]
          ],
          "radius": 0.45
        },
        {
          "portId": "out",
          "exit": [
            95.25,
            31.1,
            0
          ],
          "exitDirection": [
            1,
            0,
            0
          ],
          "points": [
            [
              116,
              27,
              25
            ],
            [
              114,
              12,
              43
            ]
          ],
          "radius": 0.45
        }
      ]
    }
  },
  "qwp": {
    "id": "qwp",
    "name": "自制绕制光纤波片 / 样品",
    "category": "偏振与样品",
    "shape": "product",
    "size": [
      216,
      50,
      60
    ],
    "ports": [
      {
        "id": "in",
        "label": "FC/PC 装配输入尾纤",
        "pos": [
          -105,
          8,
          25
        ],
        "dir": [
          -1,
          0,
          0
        ],
        "role": "in",
        "connector": "FC/PC",
        "kind": "optical",
        "gender": "male",
        "pigtailEnd": true
      },
      {
        "id": "out",
        "label": "FC/PC 装配输出尾纤",
        "pos": [
          105,
          8,
          25
        ],
        "dir": [
          1,
          0,
          0
        ],
        "role": "out",
        "connector": "FC/PC",
        "kind": "optical",
        "gender": "male",
        "pigtailEnd": true
      }
    ],
    "code": "WOUND FIBER SAMPLE",
    "note": "用户指定绕制光纤外形。参考几何与显示管径用于结构表达；未验证其1310 nm延迟量。实验室FC尾端为演示装配。",
    "source": "用户指定绕制光纤；已有论文参考几何",
    "color": "#39464d",
    "representation": "parameterized_product_reference",
    "sizeBasis": "自制绕制样品与夹持支撑示意尺寸 / mm",
    "product": {
      "kind": "wound_fiber",
      "manufacturer": "",
      "model": "",
      "bodySize": [
        145,
        50,
        60
      ],
      "bodyColor": "#39464d",
      "frontColor": "#20262b",
      "sources": [],
      "metadata": {
        "representation": "user_specified_custom_sample",
        "officialGeometry": {
          "reference_radius_mm": 10.45,
          "reference_pitch_mm": 42.2,
          "reference_fiber_arc_length_mm": 137.0,
          "derived_turns": 1.755259,
          "derived_axis_span_mm": 74.071939,
          "dimension_evidence": "existing_project_literature_reference",
          "measurement_status": "reference_geometry_not_measured_sample",
          "source_file": "app/source/catalog.json",
          "source_definition": "qwp note gives R approximately 10.45 mm, external winding pitch approximately 42.2 mm, arc length approximately 137 mm"
        },
        "opticalSpecifications": {},
        "nominalPigtails": {},
        "sourceManifest": "products-research.json",
        "referenceOnly": true,
        "nominalDesignWavelengthNM": 1310,
        "opticalPerformance": "未赋予已标定延迟量或实测波片性能",
        "connectorChoice": "演示装配采用两端FC/PC实验室尾纤，非用户样品已测连接器规格"
      },
      "estimatedDetails": [
        "绕制光纤按照用户要求绘制，自制样品没有商业厂牌或型号。",
        "R约10.45 mm、外绕螺距42.2 mm、绕制弧长137 mm沿用既有参考几何，支撑尺寸与FC/PC尾端为软件装配示意。"
      ],
      "axisHeight": 28,
      "coilRadius": 10.45,
      "coilPitch": 42.2,
      "coilArcLength": 137,
      "displayFiberRadius": 0.4,
      "fiberColor": "#c88b32",
      "pigtailBootColor": "#245ba1"
    }
  },
  "polarimeter": {
    "id": "polarimeter",
    "name": "Thorlabs PAX1000IR2/M 偏振分析仪",
    "category": "测量",
    "shape": "product",
    "size": [
      51.3,
      55.2,
      108.5
    ],
    "ports": [
      {
        "id": "in",
        "label": "FC/PC 光纤输入",
        "pos": [
          0,
          25,
          78
        ],
        "dir": [
          0,
          0,
          1
        ],
        "role": "in",
        "connector": "FC/PC",
        "kind": "optical",
        "gender": "female"
      }
    ],
    "code": "PAX1000IR2/M",
    "note": "依据官方外形与照片参数化重建，接口配合面与模型同步；显示尾纤停放及未标注细节为示意。",
    "source": "https://www.thorlabs.com/item/pax1000ir2_m",
    "color": "#ad292f",
    "representation": "parameterized_product_reference",
    "sizeBasis": "官方机身尺寸，整件包围尺寸含示意接口与停放尾纤 / mm",
    "product": {
      "kind": "polarimeter",
      "manufacturer": "Thorlabs",
      "model": "PAX1000IR2/M",
      "bodySize": [
        51,
        55,
        56.3
      ],
      "bodyColor": "#ad292f",
      "frontColor": "#20262b",
      "sources": [
        {
          "kind": "product_page",
          "url": "https://www.thorlabs.com/item/pax1000ir2_m"
        },
        {
          "kind": "product_photo",
          "url": "https://media.thorlabs.com/globalassets/items/p/pa/pax/pax1000ir2_m/mtn007800.webp?v=1115045044&v=2025-11-15-16-50-44"
        },
        {
          "kind": "CAD PDF",
          "url": "https://media.thorlabs.com/globalassets/items/p/pa/pax/pax1000ir2_m/mtn007800-e0w.pdf?v=0127031535",
          "file": "PAX1000IR2_M_MTN007800-E0W.pdf",
          "sha256": "0be83546b445302b7db44fe3e750d0614d77f87e5a0badffad0a8c2fbc4fd680"
        },
        {
          "kind": "Step",
          "url": "https://media.thorlabs.com/globalassets/items/p/pa/pax/pax1000ir2_m/mtn007800-e0w.step?v=0127031536",
          "file": "cad/PAX1000IR2_M_MTN007800-E0W.step",
          "sha256": "c67746a6eac2c5d7a12d076526b4f76116c4f5c0e458bf2a3f8de9f85479d9a7"
        },
        {
          "kind": "Manual",
          "url": "https://media.thorlabs.com/globalassets/items/p/pa/pax/pax1000ir2_m/doc-103569.pdf?v=0127060201",
          "file": "PAX1000IR2_M_DOC-103569.pdf",
          "sha256": "b3480e6a538023423222f20ecb3fb3caa73a6a900f6ffac99983dd61a6ef0c41"
        }
      ],
      "metadata": {
        "representation": "commercial_reference",
        "officialGeometry": {
          "body_size_mm_xyz": [
            51.0,
            55.0,
            56.3
          ],
          "scope": "Bare polarimeter module including its front boss; fiber-input adapter assembly is separate",
          "dimension_evidence": "manufacturer_dimension_drawing_and_current_manual",
          "drawing": "PAX1000IR2_M_MTN007800-E0W.pdf",
          "front_boss_projection_mm": 2.0,
          "front_external_thread": "SM1 (1.035 inch-40)",
          "inner_thread": "SM05 (0.535 inch-40), 4.6 mm depth",
          "cage_mount_spacing_mm": 30.0,
          "base_mount_thread": "M6 x 1, 7.5 mm depth",
          "appearance": "Red housing with black front and rear faces, side cooling slots and a round centered input boss"
        },
        "opticalSpecifications": {
          "operating_wavelength_nm": [
            900,
            1700
          ],
          "input_connector_with_included_collimator": "FC/PC",
          "input_dynamic_range_dbm": [
            -60,
            10
          ],
          "polarization_accuracy_power_range_dbm": [
            -40,
            3
          ],
          "bare_free_space_aperture_mm": 3.0,
          "mechanical_front_opening_mm": 5.0,
          "spec_source": "PAX1000IR2_M_DOC-103569.pdf Rev.B 23 January 2026, Chapter 1.4.1; aperture mechanical diameter in CAD PDF"
        },
        "nominalPigtails": {},
        "sourceManifest": "products-research.json",
        "referenceOnly": true
      },
      "estimatedDetails": [
        "裸模块 51×55×56.3 mm、30mm笼式孔距来自官方尺寸图。",
        "FC输入采用随附SM1M10、KAD12F和F240FC-C组件示意。X=0、Y=25 mm、FC配合面Z=78 mm；轴向螺纹重叠、夹持插入和最终位置为装配估计。"
      ],
      "chassisDepth": 53,
      "inputAssembly": {
        "tubeLength": 25.4,
        "adapterLength": 19.7,
        "collimatorLength": 17.3,
        "components": [
          "SM1M10",
          "KAD12F",
          "F240FC-C"
        ]
      }
    }
  }
};
